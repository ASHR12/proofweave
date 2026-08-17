import "server-only";

import { normalizeProviderReport } from "@/lib/report-parser";
import { saveReport } from "@/lib/report-store";
import {
  ResearchAlreadyRunningError,
  ResearchManager,
  ResearchRunNotFoundError,
} from "@/lib/research-manager-core";
import { createFileRunRepository } from "@/lib/run-store";
import { googleResearchLifecycle } from "@/providers/google-research";
import type { ProviderResearchResult } from "@/providers/types";
import type { ResearchRunSnapshot } from "@/types/research";

export { ResearchAlreadyRunningError, ResearchRunNotFoundError };

async function finalizeProviderResult(
  run: ResearchRunSnapshot,
  result: ProviderResearchResult,
) {
  const report = normalizeProviderReport({
    id: `research-${run.id.replace(/^run-/, "")}`,
    runId: run.id,
    question: run.question,
    scope: run.scope,
    queuedAt: run.queuedAt,
    startedAt: run.startedAt ?? run.createdAt,
    progress: run.progress,
    result,
  });
  const saved = await saveReport(report);
  return {
    id: saved.id,
    title: saved.title,
    completedAt: saved.completedAt,
    updatedAt: saved.updatedAt,
    markdown: saved.authoritative?.markdown,
  };
}

const globalResearch = globalThis as typeof globalThis & {
  __proofweaveResearchManager?: ResearchManager;
};

const researchManager =
  globalResearch.__proofweaveResearchManager ??
  new ResearchManager({
    repository: createFileRunRepository(),
    provider: googleResearchLifecycle,
    finalize: finalizeProviderResult,
  });
globalResearch.__proofweaveResearchManager = researchManager;

export async function initializeResearchManager() {
  await researchManager.initialize();
}

export async function startResearchRun(question: string, scope: string) {
  return researchManager.start(question, scope);
}

export async function getResearchRun(runId: string) {
  return researchManager.get(runId);
}

export async function discoverLatestResearchRun() {
  return researchManager.discoverLatest();
}

export async function cancelResearchRun(runId: string) {
  return researchManager.cancel(runId);
}
