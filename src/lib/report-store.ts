import "server-only";

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

import { isSafeReportId, parseResearchReport } from "@/lib/report-schema";
import type { ResearchReport } from "@/types/report";

const REPORTS_DIRECTORY = path.join(process.cwd(), "data", "reports");

export class ReportNotFoundError extends Error {}

async function ensureReportsDirectory() {
  await mkdir(REPORTS_DIRECTORY, { recursive: true });
}

async function readReportFile(filePath: string): Promise<ResearchReport> {
  const contents = await readFile(filePath, "utf8");
  return parseResearchReport(JSON.parse(contents) as unknown);
}

export async function listReports(): Promise<ResearchReport[]> {
  await ensureReportsDirectory();

  const entries = await readdir(REPORTS_DIRECTORY, { withFileTypes: true });
  const savedReports: ResearchReport[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

    try {
      const report = await readReportFile(
        path.join(REPORTS_DIRECTORY, entry.name),
      );
      savedReports.push(report);
    } catch {}
  }

  return savedReports.sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

export async function getReport(reportId: string): Promise<ResearchReport> {
  if (!isSafeReportId(reportId)) {
    throw new ReportNotFoundError("Report not found.");
  }

  try {
    return await readReportFile(
      path.join(REPORTS_DIRECTORY, `${reportId}.json`),
    );
  } catch {
    throw new ReportNotFoundError("Report not found.");
  }
}

export async function saveReport(
  reportInput: ResearchReport,
): Promise<ResearchReport> {
  await ensureReportsDirectory();

  const report = parseResearchReport({
    ...reportInput,
    origin: "saved",
    updatedAt: new Date().toISOString(),
  });
  const targetPath = path.join(REPORTS_DIRECTORY, `${report.id}.json`);
  const temporaryPath = path.join(
    REPORTS_DIRECTORY,
    `.${report.id}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }

  return report;
}

export async function deleteReport(reportId: string): Promise<void> {
  if (!isSafeReportId(reportId)) {
    throw new ReportNotFoundError("Report not found.");
  }

  try {
    await unlink(path.join(REPORTS_DIRECTORY, `${reportId}.json`));
  } catch {
    throw new ReportNotFoundError("Report not found.");
  }
}
