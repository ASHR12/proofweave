import type { ResearchReport, RunStatus } from "@/types/report";

export interface ResearchRequest {
  question: string;
  scope?: string;
}

export interface ResearchProgressEvent {
  status: Extract<
    RunStatus,
    "queued" | "researching" | "reconnecting" | "completed" | "failed"
  >;
  message: string;
  occurredAt: string;
}

export interface ResearchRunHandle {
  runId: string;
  cancel(): Promise<void>;
  events(): AsyncIterable<ResearchProgressEvent>;
  result(): Promise<ResearchReport>;
}

export interface ResearchProvider {
  readonly id: string;
  readonly displayName: string;
  start(request: ResearchRequest): Promise<ResearchRunHandle>;
}
