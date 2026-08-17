import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { RUN_STATUSES } from "@/types/report";
import type { ResearchRunSnapshot } from "@/types/research";

export type PersistedResearchRun = ResearchRunSnapshot;

export interface RunRepository {
  list(): Promise<PersistedResearchRun[]>;
  save(run: PersistedResearchRun): Promise<PersistedResearchRun>;
}

const RUN_ID_PATTERN = /^run-[a-zA-Z0-9_-]{8,96}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function parsePersistedRun(value: unknown): PersistedResearchRun {
  if (!isRecord(value)) {
    throw new TypeError("Run record must be an object.");
  }

  const valid =
    typeof value.id === "string" &&
    RUN_ID_PATTERN.test(value.id) &&
    typeof value.question === "string" &&
    typeof value.scope === "string" &&
    typeof value.status === "string" &&
    RUN_STATUSES.includes(value.status as ResearchRunSnapshot["status"]) &&
    isOptionalString(value.providerStatus) &&
    typeof value.providerLabel === "string" &&
    typeof value.providerAgent === "string" &&
    isOptionalString(value.interactionId) &&
    isOptionalString(value.lastEventId) &&
    typeof value.createdAt === "string" &&
    typeof value.queuedAt === "string" &&
    isOptionalString(value.startedAt) &&
    typeof value.updatedAt === "string" &&
    isOptionalString(value.completedAt) &&
    isOptionalString(value.reportId) &&
    isOptionalString(value.reportTitle) &&
    typeof value.reportTextPreview === "string" &&
    Array.isArray(value.progress) &&
    value.progress.every(
      (item) =>
        isRecord(item) &&
        typeof item.message === "string" &&
        typeof item.occurredAt === "string",
    ) &&
    ["submitting", "submitted", "terminal"].includes(
      String(value.submissionState),
    ) &&
    typeof value.cancellationRequested === "boolean" &&
    typeof value.recovered === "boolean" &&
    isOptionalString(value.error);

  if (!valid) {
    throw new TypeError("Run record does not match schema version 1.");
  }

  return value as unknown as PersistedResearchRun;
}

export function createFileRunRepository(
  directory = path.join(process.cwd(), "data", "runs"),
): RunRepository {
  async function ensureDirectory() {
    await mkdir(directory, { recursive: true });
  }

  return {
    async list() {
      await ensureDirectory();
      const entries = await readdir(directory, { withFileTypes: true });
      const records: PersistedResearchRun[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const contents = await readFile(path.join(directory, entry.name), "utf8");
        records.push(parsePersistedRun(JSON.parse(contents) as unknown));
      }
      return records;
    },

    async save(run) {
      await ensureDirectory();
      const validated = parsePersistedRun(structuredClone(run));
      const targetPath = path.join(directory, `${validated.id}.json`);
      const temporaryPath = path.join(
        directory,
        `.${validated.id}.${process.pid}.${randomUUID()}.tmp`,
      );
      try {
        await writeFile(
          temporaryPath,
          `${JSON.stringify(validated, null, 2)}\n`,
          { encoding: "utf8", flag: "wx" },
        );
        await rename(temporaryPath, targetPath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
      return validated;
    },
  };
}
