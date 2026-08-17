import {
  RUN_STATUSES,
  type Citation,
  type ComparisonRow,
  type KeyFinding,
  type ReportSection,
  type ResearchReport,
} from "@/types/report";

const REPORT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,95}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isCitation(value: unknown): value is Citation {
  if (!isRecord(value)) return false;

  let safeUrl: URL;
  try {
    safeUrl = new URL(String(value.url));
  } catch {
    return false;
  }

  return (
    isString(value.id) &&
    typeof value.marker === "number" &&
    Number.isInteger(value.marker) &&
    value.marker > 0 &&
    isString(value.title) &&
    isOptionalString(value.publisher) &&
    isString(value.url) &&
    ["http:", "https:"].includes(safeUrl.protocol) &&
    isOptionalString(value.publishedAt) &&
    isOptionalString(value.accessedAt) &&
    isOptionalString(value.excerpt) &&
    (value.references === undefined ||
      (Array.isArray(value.references) &&
        value.references.every(
          (reference) =>
            isRecord(reference) &&
            typeof reference.contentBlockIndex === "number" &&
            (reference.startIndex === undefined ||
              typeof reference.startIndex === "number") &&
            (reference.endIndex === undefined ||
              typeof reference.endIndex === "number"),
        )))
  );
}

function isRawUrlCitation(value: unknown) {
  return (
    isRecord(value) &&
    value.type === "url_citation" &&
    isOptionalString(value.url) &&
    isOptionalString(value.title) &&
    typeof value.contentBlockIndex === "number" &&
    (value.startIndex === undefined || typeof value.startIndex === "number") &&
    (value.endIndex === undefined || typeof value.endIndex === "number")
  );
}

function isAuthoritativeReport(value: unknown) {
  return (
    isRecord(value) &&
    value.format === "markdown" &&
    isString(value.markdown) &&
    Array.isArray(value.contentBlocks) &&
    value.contentBlocks.every(
      (block) =>
        isRecord(block) &&
        block.type === "text" &&
        isString(block.text) &&
        Array.isArray(block.annotations) &&
        block.annotations.every(isRawUrlCitation),
    ) &&
    Array.isArray(value.rawAnnotations) &&
    value.rawAnnotations.every(isRawUrlCitation)
  );
}

function isKeyFinding(value: unknown): value is KeyFinding {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.eyebrow) &&
    isString(value.title) &&
    isString(value.summary) &&
    isStringArray(value.citationIds)
  );
}

function isComparisonRow(value: unknown): value is ComparisonRow {
  return (
    isRecord(value) &&
    isString(value.criterion) &&
    isString(value.subjectA) &&
    isString(value.subjectB) &&
    isStringArray(value.citationIds)
  );
}

function isReportSection(value: unknown): value is ReportSection {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.heading) &&
    isStringArray(value.paragraphs) &&
    isStringArray(value.citationIds)
  );
}

export function isSafeReportId(value: string): boolean {
  return REPORT_ID_PATTERN.test(value);
}

export function parseResearchReport(value: unknown): ResearchReport {
  if (!isRecord(value)) {
    throw new TypeError("Report payload must be an object.");
  }

  const {
    provider,
    run,
    preview,
    comparison,
    executiveSummary,
    keyFindings,
    sections,
    citations,
  } = value;

  const valid =
    value.schemaVersion === 1 &&
    isString(value.id) &&
    isSafeReportId(value.id) &&
    value.origin === "saved" &&
    isString(value.title) &&
    isString(value.question) &&
    isString(value.scope) &&
    isString(value.status) &&
    RUN_STATUSES.includes(value.status as ResearchReport["status"]) &&
    isString(value.createdAt) &&
    isString(value.updatedAt) &&
    isOptionalString(value.completedAt) &&
    (value.durationSeconds === undefined ||
      (typeof value.durationSeconds === "number" &&
        Number.isFinite(value.durationSeconds) &&
        value.durationSeconds >= 0)) &&
    isRecord(provider) &&
    isString(provider.id) &&
    isString(provider.label) &&
    isString(provider.agent) &&
    provider.mode === "deep-research" &&
    isRecord(run) &&
    isString(run.id) &&
    isOptionalString(run.queuedAt) &&
    isOptionalString(run.startedAt) &&
    isOptionalString(run.completedAt) &&
    isRecord(preview) &&
    typeof preview.isPreview === "boolean" &&
    isString(preview.label) &&
    isString(preview.note) &&
    isStringArray(executiveSummary) &&
    Array.isArray(keyFindings) &&
    keyFindings.every(isKeyFinding) &&
    isRecord(comparison) &&
    isString(comparison.subjectA) &&
    isString(comparison.subjectB) &&
    Array.isArray(comparison.rows) &&
    comparison.rows.every(isComparisonRow) &&
    Array.isArray(sections) &&
    sections.every(isReportSection) &&
    Array.isArray(citations) &&
    citations.every(isCitation) &&
    (value.authoritative === undefined ||
      isAuthoritativeReport(value.authoritative)) &&
    (value.progress === undefined ||
      (Array.isArray(value.progress) &&
        value.progress.every(
          (item) =>
            isRecord(item) &&
            isString(item.message) &&
            isString(item.occurredAt),
        ))) &&
    isOptionalString(value.failureMessage);

  if (!valid) {
    throw new TypeError("Report payload does not match schema version 1.");
  }

  return value as unknown as ResearchReport;
}
