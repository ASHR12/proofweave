import assert from "node:assert/strict";
import test from "node:test";

import { ResearchManager } from "./research-manager-core";
import type {
  PersistedResearchRun,
  RunRepository,
} from "./run-store";
import type {
  ProviderResearchResult,
  ResearchLifecycleProvider,
} from "../providers/types";

function persistedRun(
  overrides: Partial<PersistedResearchRun> = {},
): PersistedResearchRun {
  return {
    id: "run-recovery123",
    question: "Recover this question",
    scope: "",
    status: "researching",
    providerStatus: "in_progress",
    providerLabel: "Deep Research",
    providerAgent: "deep-research-preview-04-2026",
    interactionId: "interaction-recovery",
    lastEventId: "event-10",
    createdAt: "2026-08-17T06:00:00.000Z",
    queuedAt: "2026-08-17T06:00:00.000Z",
    startedAt: "2026-08-17T06:00:01.000Z",
    updatedAt: "2026-08-17T06:00:02.000Z",
    reportTextPreview: "",
    progress: [],
    submissionState: "submitted",
    cancellationRequested: false,
    recovered: false,
    ...overrides,
  };
}

function memoryRepository(initial: PersistedResearchRun[]): RunRepository & {
  records: Map<string, PersistedResearchRun>;
} {
  const records = new Map(initial.map((run) => [run.id, structuredClone(run)]));
  return {
    records,
    async list() {
      return Array.from(records.values()).map((run) => structuredClone(run));
    },
    async save(run) {
      records.set(run.id, structuredClone(run));
      return structuredClone(run);
    },
  };
}

function completedResult(): ProviderResearchResult {
  return {
    provider: {
      id: "google-deep-research",
      label: "Deep Research",
      agent: "deep-research-preview-04-2026",
      mode: "deep-research",
    },
    interactionId: "interaction-recovery",
    providerStatus: "completed",
    lastEventId: "event-final",
    contentBlocks: [
      { type: "text", text: "# Recovered report", annotations: [] },
    ],
    rawAnnotations: [],
    completedAt: "2026-08-17T06:10:00.000Z",
  };
}

function dependencies(
  repository: RunRepository,
  provider: ResearchLifecycleProvider,
) {
  return {
    repository,
    provider,
    clock: () => "2026-08-17T06:05:00.000Z",
    finalize: async () => ({
      id: "research-recovered",
      title: "Recovered report",
      completedAt: "2026-08-17T06:10:00.000Z",
      updatedAt: "2026-08-17T06:10:01.000Z",
      markdown: "# Recovered report",
    }),
  };
}

test("recovers a completed remote interaction without creating another", async () => {
  const repository = memoryRepository([persistedRun()]);
  let createCalls = 0;
  let resumeCalls = 0;
  const provider: ResearchLifecycleProvider = {
    async create() {
      createCalls += 1;
      throw new Error("create must not run during recovery");
    },
    async resume() {
      resumeCalls += 1;
      return completedResult();
    },
    async cancel() {},
  };
  const manager = new ResearchManager(dependencies(repository, provider));

  await manager.initialize();
  await manager.waitForIdle();
  const recovered = await manager.get("run-recovery123");

  assert.equal(createCalls, 0);
  assert.equal(resumeCalls, 1);
  assert.equal(recovered.status, "completed");
  assert.equal(recovered.reportId, "research-recovered");
  assert.equal(recovered.recovered, true);
});

test("resumes an active interaction from its last event and persists progress", async () => {
  const repository = memoryRepository([persistedRun()]);
  let receivedLastEventId: string | undefined;
  const provider: ResearchLifecycleProvider = {
    async create() {
      throw new Error("create must not run during recovery");
    },
    async resume(_interactionId, lastEventId, callbacks) {
      receivedLastEventId = lastEventId;
      await callbacks.onEvent({
        type: "run.reconnecting",
        attempt: 1,
        lastEventId,
        occurredAt: "2026-08-17T06:05:01.000Z",
      });
      await callbacks.onEvent({
        type: "progress",
        eventId: "event-11",
        message: "Provider summary restored.",
        occurredAt: "2026-08-17T06:05:02.000Z",
      });
      return completedResult();
    },
    async cancel() {},
  };
  const manager = new ResearchManager(dependencies(repository, provider));

  await manager.initialize();
  await manager.waitForIdle();
  const recovered = await manager.get("run-recovery123");

  assert.equal(receivedLastEventId, "event-10");
  assert.equal(recovered.lastEventId, "event-final");
  assert.ok(
    recovered.progress.some(
      ({ message }) => message === "Provider summary restored.",
    ),
  );
});

test("missing interaction ID fails safely without retrying", async () => {
  const repository = memoryRepository([
    persistedRun({
      interactionId: undefined,
      submissionState: "submitting",
      status: "queued",
    }),
  ]);
  let providerCalls = 0;
  const provider: ResearchLifecycleProvider = {
    async create() {
      providerCalls += 1;
      throw new Error("unexpected create");
    },
    async resume() {
      providerCalls += 1;
      throw new Error("unexpected resume");
    },
    async cancel() {},
  };
  const manager = new ResearchManager(dependencies(repository, provider));

  await manager.initialize();
  const recovered = await manager.get("run-recovery123");

  assert.equal(providerCalls, 0);
  assert.equal(recovered.status, "failed");
  assert.match(recovered.error ?? "", /duplicate paid task/i);
});

test("initialization never launches duplicate recovery workers", async () => {
  const repository = memoryRepository([persistedRun()]);
  let resumeCalls = 0;
  let release: ((result: ProviderResearchResult) => void) | undefined;
  const pending = new Promise<ProviderResearchResult>((resolve) => {
    release = resolve;
  });
  const provider: ResearchLifecycleProvider = {
    async create() {
      throw new Error("unexpected create");
    },
    async resume() {
      resumeCalls += 1;
      return pending;
    },
    async cancel() {},
  };
  const manager = new ResearchManager(dependencies(repository, provider));

  await Promise.all([manager.initialize(), manager.initialize()]);
  assert.equal(resumeCalls, 1);
  assert.equal(manager.activeWorkerCount(), 1);
  const discovered = await manager.discoverLatest();
  assert.equal(discovered?.id, "run-recovery123");
  assert.equal(discovered?.status, "reconnecting");

  release?.(completedResult());
  await manager.waitForIdle();
  assert.equal(resumeCalls, 1);
});
