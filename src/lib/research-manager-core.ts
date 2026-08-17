import { randomUUID } from "node:crypto";

import type {
  PersistedResearchRun,
  RunRepository,
} from "@/lib/run-store";
import { ResearchProviderTerminalError } from "@/providers/types";
import type {
  ProviderResearchResult,
  ResearchLifecycleProvider,
} from "@/providers/types";
import type { ResearchEvent, ResearchRunSnapshot } from "@/types/research";

const ACTIVE_STATUSES = ["queued", "researching", "reconnecting"] as const;
const MISSING_INTERACTION_MESSAGE =
  "Proofweave stopped before a Google interaction ID was safely persisted. Automatic retry is disabled because it could create a duplicate paid task.";

export class ResearchAlreadyRunningError extends Error {}
export class ResearchRunNotFoundError extends Error {}

export interface FinalizedReport {
  id: string;
  title: string;
  completedAt?: string;
  updatedAt: string;
  markdown?: string;
}

export interface ResearchManagerDependencies {
  repository: RunRepository;
  provider: ResearchLifecycleProvider;
  finalize: (
    run: ResearchRunSnapshot,
    result: ProviderResearchResult,
  ) => Promise<FinalizedReport>;
  clock?: () => string;
}

function isActive(run: ResearchRunSnapshot) {
  return ACTIVE_STATUSES.includes(
    run.status as (typeof ACTIVE_STATUSES)[number],
  );
}

export function sanitizeStoredMessage(message: string) {
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
    )
    .slice(0, 1_000);
}

function publicSnapshot(run: ResearchRunSnapshot) {
  return structuredClone(run);
}

export class ResearchManager {
  private readonly runs = new Map<string, ResearchRunSnapshot>();
  private readonly workers = new Map<string, Promise<void>>();
  private initialization?: Promise<void>;
  private readonly now: () => string;

  constructor(private readonly dependencies: ResearchManagerDependencies) {
    this.now = dependencies.clock ?? (() => new Date().toISOString());
  }

  async initialize() {
    if (!this.initialization) {
      this.initialization = this.initializeOnce();
    }
    await this.initialization;
  }

  private async initializeOnce() {
    const persisted = await this.dependencies.repository.list();
    for (const record of persisted) {
      this.runs.set(record.id, record);
    }

    for (const run of this.runs.values()) {
      if (!isActive(run)) continue;
      run.recovered = true;
      if (!run.interactionId) {
        run.status = "failed";
        run.providerStatus = "unknown";
        run.submissionState = "terminal";
        run.completedAt = this.now();
        run.updatedAt = run.completedAt;
        run.error = MISSING_INTERACTION_MESSAGE;
        run.progress = [
          ...run.progress,
          { message: MISSING_INTERACTION_MESSAGE, occurredAt: run.updatedAt },
        ].slice(-30);
        await this.persist(run);
        continue;
      }

      run.status = "reconnecting";
      run.updatedAt = this.now();
      run.progress = [
        ...run.progress,
        {
          message:
            "Recovered the saved Google interaction ID. Reconciling provider status without starting a new interaction.",
          occurredAt: run.updatedAt,
        },
      ].slice(-30);
      await this.persist(run);
      this.launchWorker(run);
    }
  }

  private async persist(run: ResearchRunSnapshot) {
    const safeRecord: PersistedResearchRun = {
      ...publicSnapshot(run),
      reportTextPreview: "",
      progress: run.progress.slice(-30).map((item) => ({
        message: sanitizeStoredMessage(item.message),
        occurredAt: item.occurredAt,
      })),
      error: run.error ? sanitizeStoredMessage(run.error) : undefined,
    };
    await this.dependencies.repository.save(safeRecord);
  }

  private async applyEvent(run: ResearchRunSnapshot, event: ResearchEvent) {
    run.updatedAt = event.occurredAt;
    if ("eventId" in event && event.eventId) run.lastEventId = event.eventId;

    switch (event.type) {
      case "run.created":
        run.interactionId = event.interactionId;
        run.status = "researching";
        break;
      case "run.status":
        run.providerStatus = event.providerStatus;
        if (event.status !== "completed") run.status = event.status;
        break;
      case "progress":
        run.progress = [
          ...run.progress,
          {
            message: sanitizeStoredMessage(event.message),
            occurredAt: event.occurredAt,
          },
        ].slice(-30);
        break;
      case "report.delta":
        run.reportTextPreview = `${run.reportTextPreview}${event.text}`.slice(
          -4_000,
        );
        break;
      case "run.reconnecting":
        run.status = "reconnecting";
        run.progress = [
          ...run.progress,
          {
            message: `Restoring the provider stream (attempt ${event.attempt}).`,
            occurredAt: event.occurredAt,
          },
        ].slice(-30);
        break;
      case "run.completed":
        if (event.interactionId) run.interactionId = event.interactionId;
        break;
      case "run.failed":
        run.status = "failed";
        run.error = sanitizeStoredMessage(event.message);
        run.providerStatus = event.providerStatus;
        break;
      case "run.cancelled":
        run.status = "cancelled";
        break;
    }
    await this.persist(run);
  }

  private launchWorker(run: ResearchRunSnapshot) {
    const existing = this.workers.get(run.id);
    if (existing) return existing;

    const worker = this.executeExistingInteraction(run).finally(() => {
      this.workers.delete(run.id);
    });
    this.workers.set(run.id, worker);
    return worker;
  }

  private async executeExistingInteraction(run: ResearchRunSnapshot) {
    if (!run.interactionId) return;

    try {
      const result = await this.dependencies.provider.resume(
        run.interactionId,
        run.lastEventId,
        {
          onEvent: (event) => this.applyEvent(run, event),
          isCancellationRequested: () => run.cancellationRequested,
        },
      );
      const savedReport = await this.dependencies.finalize(run, result);
      run.providerStatus = result.providerStatus;
      run.interactionId = result.interactionId ?? run.interactionId;
      run.lastEventId = result.lastEventId ?? run.lastEventId;
      run.status = "completed";
      run.submissionState = "terminal";
      run.completedAt = savedReport.completedAt ?? result.completedAt;
      run.updatedAt = savedReport.updatedAt;
      run.reportId = savedReport.id;
      run.reportTitle = savedReport.title;
      run.reportTextPreview = savedReport.markdown?.slice(-4_000) ?? "";
      run.error = undefined;
    } catch (error) {
      run.completedAt = this.now();
      run.updatedAt = run.completedAt;
      run.submissionState = "terminal";
      if (
        error instanceof ResearchProviderTerminalError &&
        error.providerStatus === "cancelled"
      ) {
        run.status = "cancelled";
        run.providerStatus = "cancelled";
        run.error = undefined;
      } else {
        run.status = "failed";
        run.providerStatus =
          error instanceof ResearchProviderTerminalError
            ? error.providerStatus
            : run.providerStatus;
        run.error = sanitizeStoredMessage(
          error instanceof Error ? error.message : "The research run failed.",
        );
      }
    }
    await this.persist(run);
  }

  async start(question: string, scope: string) {
    await this.initialize();
    const activeRun = Array.from(this.runs.values()).find(isActive);
    if (activeRun) {
      throw new ResearchAlreadyRunningError(
        "A research run is already active. Reopen it before starting another.",
      );
    }

    const createdAt = this.now();
    const run: ResearchRunSnapshot = {
      id: `run-${randomUUID()}`,
      question,
      scope,
      status: "queued",
      providerStatus: "queued",
      providerLabel: "Deep Research",
      providerAgent: "deep-research-preview-04-2026",
      createdAt,
      queuedAt: createdAt,
      updatedAt: createdAt,
      reportTextPreview: "",
      progress: [
        {
          message:
            "Saving the local submission record before contacting Google.",
          occurredAt: createdAt,
        },
      ],
      submissionState: "submitting",
      cancellationRequested: false,
      recovered: false,
    };
    this.runs.set(run.id, run);
    await this.persist(run);

    try {
      const submission = await this.dependencies.provider.create(question, scope);
      run.interactionId = submission.interactionId;
      run.providerStatus = submission.providerStatus;
      run.startedAt = submission.createdAt ?? this.now();
      run.updatedAt = this.now();
      run.status =
        submission.providerStatus === "queued" ? "queued" : "researching";
      run.submissionState = "submitted";
      run.progress = [
        ...run.progress,
        {
          message:
            "Google accepted the background interaction and its ID is saved locally.",
          occurredAt: run.updatedAt,
        },
      ].slice(-30);
      await this.persist(run);
      this.launchWorker(run);
      return publicSnapshot(run);
    } catch (error) {
      run.status = "failed";
      run.submissionState = "terminal";
      run.completedAt = this.now();
      run.updatedAt = run.completedAt;
      run.error = sanitizeStoredMessage(
        error instanceof Error
          ? error.message
          : "The research submission failed.",
      );
      await this.persist(run);
      throw error;
    }
  }

  async get(runId: string) {
    await this.initialize();
    const run = this.runs.get(runId);
    if (!run) throw new ResearchRunNotFoundError("Research run not found.");
    return publicSnapshot(run);
  }

  async discoverLatest() {
    await this.initialize();
    const sorted = Array.from(this.runs.values()).sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
    const active = sorted.find(isActive);
    return active
      ? publicSnapshot(active)
      : sorted[0]
        ? publicSnapshot(sorted[0])
        : null;
  }

  async cancel(runId: string) {
    await this.initialize();
    const run = this.runs.get(runId);
    if (!run) throw new ResearchRunNotFoundError("Research run not found.");
    if (!isActive(run)) return publicSnapshot(run);

    run.cancellationRequested = true;
    run.updatedAt = this.now();
    run.progress = [
      ...run.progress,
      {
        message:
          "Cancellation requested. Proofweave will reconcile the provider's actual status before marking the run cancelled.",
        occurredAt: run.updatedAt,
      },
    ].slice(-30);
    await this.persist(run);

    if (run.interactionId) {
      try {
        await this.dependencies.provider.cancel(run.interactionId);
      } catch (error) {
        run.progress = [
          ...run.progress,
          {
            message: sanitizeStoredMessage(
              `Cancellation was not confirmed immediately: ${
                error instanceof Error ? error.message : "provider error"
              }`,
            ),
            occurredAt: this.now(),
          },
        ].slice(-30);
        await this.persist(run);
      }
      this.launchWorker(run);
    }
    return publicSnapshot(run);
  }

  async waitForIdle() {
    while (this.workers.size > 0) {
      await Promise.allSettled(Array.from(this.workers.values()));
    }
  }

  activeWorkerCount() {
    return this.workers.size;
  }
}
