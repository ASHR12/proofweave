import "server-only";

import { GoogleGenAI } from "@google/genai";

import { buildResearchInput } from "@/providers/report-contract";
import { ResearchProviderTerminalError } from "@/providers/types";
import type {
  ProviderCallbacks,
  ProviderResearchResult,
  ProviderSubmission,
  ResearchLifecycleProvider,
} from "@/providers/types";
import type {
  AuthoritativeContentBlock,
  RawUrlCitation,
} from "@/types/report";
import type { ProviderStatus } from "@/types/research";

const DEEP_RESEARCH_AGENT = "deep-research-preview-04-2026";
const POLL_INTERVAL_MS = 5_000;

interface DeepCursor {
  interactionId?: string;
  lastEventId?: string;
  providerStatus: ProviderStatus;
  reconnectAttempt: number;
}

interface RawAnnotation {
  type?: string;
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
}

interface RawContent {
  type?: string;
  text?: string;
  annotations?: RawAnnotation[];
}

interface RawStep {
  type?: string;
  content?: RawContent[];
}

interface RawInteraction {
  id?: string;
  status?: ProviderStatus;
  created?: string;
  updated?: string;
  steps?: RawStep[];
  errors?: Array<{
    code?: string;
    message?: string;
  }>;
}

interface RawStreamEvent {
  event_type?: string;
  event_id?: string;
  interaction_id?: string;
  interaction?: RawInteraction;
  status?: ProviderStatus;
  delta?: {
    type?: string;
    text?: string;
    content?: RawContent;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

function now() {
  return new Date().toISOString();
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API credentials are not configured.");
  }
  return new GoogleGenAI({ apiKey });
}

function errorRecord(error: unknown) {
  return typeof error === "object" && error !== null
    ? (error as Record<string, unknown>)
    : undefined;
}

function sanitizeProviderMessage(message: string) {
  return message
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
    .replace(/key=[^&\s]+/gi, "key=[redacted]")
    .replace(
      /(x-goog-api-key["':=\s]+)[^\s"',}]+/gi,
      "$1[redacted]",
    )
    .replace(
      /(authorization["':=\s]+bearer\s+)[^\s"',}]+/gi,
      "$1[redacted]",
    );
}

function safeErrorMessage(error: unknown) {
  const record = errorRecord(error);
  const nested = errorRecord(record?.error) ?? errorRecord(record?.cause);
  const message =
    error instanceof Error
      ? error.message
      : typeof record?.message === "string"
        ? record.message
        : typeof nested?.message === "string"
          ? nested.message
          : "The research provider returned an unknown error.";
  return sanitizeProviderMessage(message);
}

function errorStatus(error: unknown) {
  const records = [errorRecord(error)];
  const outer = records[0];
  records.push(errorRecord(outer?.error), errorRecord(outer?.cause));
  for (const record of records) {
    if (!record) continue;
    for (const key of ["status", "statusCode", "code"]) {
      const value = record[key];
      if (typeof value === "number") return value;
      if (typeof value === "string" && /^\d{3}$/.test(value)) {
        return Number(value);
      }
    }
  }
  return undefined;
}

function errorCode(error: unknown) {
  const records = [errorRecord(error)];
  const outer = records[0];
  records.push(errorRecord(outer?.error), errorRecord(outer?.cause));
  for (const record of records) {
    if (!record) continue;
    for (const key of ["code", "status"]) {
      const value = record[key];
      if (typeof value === "string" && !/^\d{3}$/.test(value)) return value;
    }
  }
  return undefined;
}

function unavailableInteractionStatus(error: unknown): ProviderStatus | undefined {
  const status = errorStatus(error);
  const code = errorCode(error)?.toLowerCase();
  if (status === 404 || code?.includes("not_found")) return "not_found";
  if (status === 410 || code?.includes("expired")) return "expired";
  return undefined;
}

class DeepResearchProviderError extends Error {
  constructor(
    message: string,
    readonly providerCode?: string,
  ) {
    super(message);
    this.name = "DeepResearchProviderError";
  }
}

function formatGoogleResearchError(error: unknown) {
  const status = errorStatus(error);
  const code =
    error instanceof DeepResearchProviderError
      ? error.providerCode
      : errorCode(error);
  const details = [
    status === undefined ? undefined : `HTTP ${status}`,
    code,
  ].filter(Boolean);
  const qualifier = details.length > 0 ? ` (${details.join(", ")})` : "";
  return `Google Deep Research request failed${qualifier}: ${safeErrorMessage(error)}`;
}

function interactionFailure(interaction: RawInteraction, status: ProviderStatus) {
  const providerError = interaction.errors?.find(
    ({ code, message }) => Boolean(code || message),
  );
  return new DeepResearchProviderError(
    providerError?.message
      ? sanitizeProviderMessage(providerError.message)
      : `The interaction stopped with status ${status}.`,
    providerError?.code,
  );
}

function mapProviderStatus(status: ProviderStatus) {
  if (status === "queued") return "queued" as const;
  if (status === "in_progress") return "researching" as const;
  if (status === "completed") return "completed" as const;
  if (status === "cancelled") return "cancelled" as const;
  return "failed" as const;
}

async function emitStatus(
  callbacks: ProviderCallbacks,
  providerStatus: ProviderStatus,
  eventId?: string,
) {
  await callbacks.onEvent({
    type: "run.status",
    providerStatus,
    status: mapProviderStatus(providerStatus),
    eventId,
    occurredAt: now(),
  });
}

function thoughtSummaryText(content: RawContent | undefined) {
  return content?.type === "text" && content.text
    ? content.text.trim()
    : undefined;
}

async function consumeDeepStream(
  stream: AsyncIterable<unknown>,
  cursor: DeepCursor,
  callbacks: ProviderCallbacks,
) {
  let terminal = false;

  for await (const rawValue of stream) {
    const event = rawValue as RawStreamEvent;
    if (event.event_id) cursor.lastEventId = event.event_id;

    if (event.event_type === "interaction.created" && event.interaction?.id) {
      cursor.interactionId = event.interaction.id;
      cursor.providerStatus = event.interaction.status ?? "in_progress";
      await callbacks.onEvent({
        type: "run.created",
        interactionId: event.interaction.id,
        eventId: event.event_id,
        occurredAt: now(),
      });
      await emitStatus(callbacks, cursor.providerStatus, event.event_id);
    } else if (event.event_type === "interaction.status_update") {
      cursor.providerStatus = event.status ?? cursor.providerStatus;
      await emitStatus(callbacks, cursor.providerStatus, event.event_id);
      terminal = [
        "completed",
        "failed",
        "cancelled",
        "incomplete",
        "budget_exceeded",
        "requires_action",
      ].includes(cursor.providerStatus);
    } else if (event.event_type === "step.delta") {
      if (event.delta?.type === "text" && event.delta.text) {
        await callbacks.onEvent({
          type: "report.delta",
          text: event.delta.text,
          eventId: event.event_id,
          occurredAt: now(),
        });
      } else if (
        event.delta?.type === "thought_summary" ||
        event.delta?.type === "thought"
      ) {
        const message =
          event.delta.text ?? thoughtSummaryText(event.delta.content);
        if (message) {
          await callbacks.onEvent({
            type: "progress",
            message,
            eventId: event.event_id,
            occurredAt: now(),
          });
        }
      }
    } else if (event.event_type === "interaction.completed") {
      cursor.providerStatus = event.interaction?.status ?? "completed";
      terminal = true;
      await emitStatus(callbacks, cursor.providerStatus, event.event_id);
      if (cursor.providerStatus === "completed") {
        await callbacks.onEvent({
          type: "run.completed",
          eventId: event.event_id,
          interactionId: cursor.interactionId,
          occurredAt: now(),
        });
      }
    } else if (event.event_type === "error") {
      throw new DeepResearchProviderError(
        event.error?.message
          ? sanitizeProviderMessage(event.error.message)
          : "The Deep Research stream returned an error.",
        event.error?.code,
      );
    }

  }

  return terminal;
}

function extractDeepResult(
  interaction: RawInteraction,
  cursor: DeepCursor,
): ProviderResearchResult {
  const modelOutput = [...(interaction.steps ?? [])]
    .reverse()
    .find(
      (step) =>
        step.type === "model_output" &&
        step.content?.some(
          (content) => content.type === "text" && Boolean(content.text),
        ),
    );
  const contentBlocks: AuthoritativeContentBlock[] = [];
  const rawAnnotations: RawUrlCitation[] = [];

  for (const content of modelOutput?.content ?? []) {
    if (content.type !== "text" || !content.text) continue;
    const contentBlockIndex = contentBlocks.length;
    const annotations = (content.annotations ?? [])
      .filter(({ type }) => type === "url_citation")
      .map((annotation) => ({
        type: "url_citation" as const,
        url: annotation.url,
        title: annotation.title,
        startIndex: annotation.start_index,
        endIndex: annotation.end_index,
        contentBlockIndex,
      }));
    contentBlocks.push({
      type: "text",
      text: content.text,
      annotations,
    });
    rawAnnotations.push(...annotations);
  }

  if (contentBlocks.length === 0) {
    throw new Error("Deep Research completed without a text report.");
  }

  return {
    provider: {
      id: "google-deep-research",
      label: "Deep Research",
      agent: DEEP_RESEARCH_AGENT,
      mode: "deep-research",
    },
    interactionId: interaction.id ?? cursor.interactionId,
    providerStatus: interaction.status ?? cursor.providerStatus,
    lastEventId: cursor.lastEventId,
    contentBlocks,
    rawAnnotations,
    createdAt: interaction.created,
    completedAt: now(),
  };
}

export async function createGoogleResearchInteraction(
  question: string,
  scope: string,
): Promise<ProviderSubmission> {
  try {
    const interaction = (await getClient().interactions.create({
      agent: DEEP_RESEARCH_AGENT,
      input: buildResearchInput(question, scope),
      agent_config: {
        type: "deep-research",
        thinking_summaries: "auto",
        collaborative_planning: false,
        visualization: "off",
      },
      background: true,
      stream: false,
      store: true,
    })) as unknown as RawInteraction;
    if (!interaction.id) {
      throw new Error("Deep Research did not return an interaction ID.");
    }
    return {
      interactionId: interaction.id,
      providerStatus: interaction.status ?? "queued",
      createdAt: interaction.created,
    };
  } catch (error) {
    throw new Error(formatGoogleResearchError(error), { cause: error });
  }
}

export async function resumeGoogleResearchInteraction(
  interactionId: string,
  lastEventId: string | undefined,
  callbacks: ProviderCallbacks,
): Promise<ProviderResearchResult> {
  const client = getClient();
  const cursor: DeepCursor = {
    interactionId,
    lastEventId,
    providerStatus: "in_progress",
    reconnectAttempt: 0,
  };
  let cancelSent = false;

  try {
    while (true) {
      const interaction = (await client.interactions.get(
        interactionId,
      )) as unknown as RawInteraction;
      cursor.providerStatus = interaction.status ?? cursor.providerStatus;
      await emitStatus(callbacks, cursor.providerStatus);

      if (cursor.providerStatus === "completed") {
        return extractDeepResult(interaction, cursor);
      }
      if (
        [
          "cancelled",
          "failed",
          "incomplete",
          "budget_exceeded",
          "requires_action",
        ].includes(cursor.providerStatus)
      ) {
        const failure = interactionFailure(interaction, cursor.providerStatus);
        throw new ResearchProviderTerminalError(
          failure.message,
          cursor.providerStatus,
        );
      }

      if (callbacks.isCancellationRequested() && !cancelSent) {
        await client.interactions.cancel(interactionId);
        cancelSent = true;
        await delay(POLL_INTERVAL_MS);
        continue;
      }

      try {
        const resumedStream = await client.interactions.get(interactionId, {
          stream: true,
          last_event_id: cursor.lastEventId,
        });
        await consumeDeepStream(
          resumedStream as unknown as AsyncIterable<unknown>,
          cursor,
          callbacks,
        );
      } catch (streamError) {
        if (streamError instanceof DeepResearchProviderError) throw streamError;
        cursor.reconnectAttempt += 1;
        await callbacks.onEvent({
          type: "run.reconnecting",
          attempt: cursor.reconnectAttempt,
          lastEventId: cursor.lastEventId,
          occurredAt: now(),
        });
        await delay(POLL_INTERVAL_MS);
      }
    }
  } catch (error) {
    if (error instanceof ResearchProviderTerminalError) throw error;
    const unavailableStatus = unavailableInteractionStatus(error);
    if (unavailableStatus) {
      throw new ResearchProviderTerminalError(
        unavailableStatus === "expired"
          ? "The saved Google interaction has expired and cannot be recovered."
          : "The saved Google interaction was not found and cannot be recovered.",
        unavailableStatus,
      );
    }
    throw new Error(formatGoogleResearchError(error), { cause: error });
  }
}

export async function cancelGoogleInteraction(interactionId: string) {
  try {
    await getClient().interactions.cancel(interactionId);
  } catch (error) {
    throw new Error(formatGoogleResearchError(error), { cause: error });
  }
}

export const googleResearchLifecycle: ResearchLifecycleProvider = {
  create: createGoogleResearchInteraction,
  resume: resumeGoogleResearchInteraction,
  cancel: cancelGoogleInteraction,
};
