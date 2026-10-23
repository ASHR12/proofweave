export const RUN_STATUSES = [
  "idle",
  "queued",
  "researching",
  "reconnecting",
  "completed",
  "failed",
  "cancelled",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export type ReportOrigin = "saved";

export interface RawUrlCitation {
  type: "url_citation";
  url?: string;
  title?: string;
  startIndex?: number;
  endIndex?: number;
  contentBlockIndex: number;
}

export interface AuthoritativeContentBlock {
  type: "text";
  text: string;
  annotations: RawUrlCitation[];
}

export interface AuthoritativeReport {
  format: "markdown";
  markdown: string;
  contentBlocks: AuthoritativeContentBlock[];
  rawAnnotations: RawUrlCitation[];
}

export interface Citation {
  id: string;
  marker: number;
  title: string;
  publisher?: string;
  url: string;
  publishedAt?: string;
  accessedAt?: string;
  excerpt?: string;
  references?: Array<{
    contentBlockIndex: number;
    startIndex?: number;
    endIndex?: number;
  }>;
}

export interface KeyFinding {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  citationIds: string[];
}

export interface ComparisonRow {
  criterion: string;
  subjectA: string;
  subjectB: string;
  citationIds: string[];
}

export interface ReportSection {
  id: string;
  heading: string;
  paragraphs: string[];
  citationIds: string[];
}

export interface ProviderMetadata {
  id: string;
  label: string;
  agent: string;
  mode: "deep-research";
}

export interface RunMetadata {
  id: string;
  interactionId?: string;
  providerStatus?: string;
  lastEventId?: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface PreviewMetadata {
  isPreview: boolean;
  label: string;
  note: string;
}

export interface ResearchReport {
  schemaVersion: 1;
  id: string;
  origin: ReportOrigin;
  workspaceId?: string;
  ownerId?: string;
  visibility?: "private" | "workspace";
  title: string;
  question: string;
  scope: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  durationSeconds?: number;
  provider: ProviderMetadata;
  run: RunMetadata;
  preview: PreviewMetadata;
  executiveSummary: string[];
  keyFindings: KeyFinding[];
  comparison: {
    subjectA: string;
    subjectB: string;
    rows: ComparisonRow[];
  };
  sections: ReportSection[];
  citations: Citation[];
  authoritative?: AuthoritativeReport;
  normalization?: {
    method: "deterministic-markdown";
    parserVersion: string;
    warnings: string[];
  };
  progress?: Array<{
    message: string;
    occurredAt: string;
  }>;
  failureMessage?: string;
}

export interface ReportsCollectionResponse {
  reports: ResearchReport[];
}

export interface ReportResponse {
  report: ResearchReport;
}

export interface ApiErrorResponse {
  error: string;
}
