import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createFileRunRepository } from "./run-store";
import type { ResearchRunSnapshot } from "../types/research";

function runRecord(): ResearchRunSnapshot {
  return {
    id: "run-12345678",
    question: "A persisted question",
    scope: "",
    status: "researching",
    providerStatus: "in_progress",
    providerLabel: "Deep Research",
    providerAgent: "deep-research-preview-04-2026",
    interactionId: "interaction-123",
    lastEventId: "event-4",
    createdAt: "2026-08-17T06:00:00.000Z",
    queuedAt: "2026-08-17T06:00:00.000Z",
    startedAt: "2026-08-17T06:00:01.000Z",
    updatedAt: "2026-08-17T06:00:02.000Z",
    reportTextPreview: "",
    progress: [
      {
        message: "Researching safely.",
        occurredAt: "2026-08-17T06:00:02.000Z",
      },
    ],
    submissionState: "submitted",
    cancellationRequested: false,
    recovered: false,
  };
}

test("atomically saves and reloads one run record", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "proofweave-runs-"));
  try {
    const repository = createFileRunRepository(directory);
    const original = runRecord();
    await repository.save(original);
    await repository.save({
      ...original,
      status: "reconnecting",
      updatedAt: "2026-08-17T06:00:03.000Z",
    });

    const loaded = await repository.list();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].status, "reconnecting");
    assert.equal(loaded[0].interactionId, "interaction-123");
    assert.deepEqual(await readdir(directory), ["run-12345678.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
