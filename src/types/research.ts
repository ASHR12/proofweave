import type { ResearchReport, RunStatus } from "@/types/report";

export type ProviderStatus =
  | "queued"
  | "in_progress"
  | "requires_action"
  | "completed"
  | "failed"
  | "cancelled"
  | "incomplete"
  | "budget_exceeded"
  | string;

export type ResearchEvent =
  | {
      type: "run.created";
      eventId?: string;
      interactionId: string;
      occurredAt: string;
    }
  | {
      type: "run.status";
      eventId?: string;
      providerStatus: ProviderStatus;
      status: RunStatus;
      occurredAt: string;
    }
  | {
      type: "progress";
      eventId?: string;
      message: string;
      occurredAt: string;
    }
  | {
      type: "report.delta";
      eventId?: string;
      text: string;
      occurredAt: string;
    }
  | {
      type: "run.reconnecting";
      attempt: number;
      lastEventId?: string;
      occurredAt: string;
    }
  | {
      type: "run.completed";
      eventId?: string;
      interactionId?: string;
      occurredAt: string;
    }
  | {
      type: "run.failed";
      code?: string;
      message: string;
      providerStatus?: ProviderStatus;
      occurredAt: string;
    }
  | {
      type: "run.cancelled";
      interactionId?: string;
      occurredAt: string;
    };

export interface ResearchRunSnapshot {
  id: string;
  question: string;
  scope: string;
  status: RunStatus;
  providerStatus?: ProviderStatus;
  providerLabel: string;
  providerAgent: string;
  interactionId?: string;
  lastEventId?: string;
  createdAt: string;
  queuedAt: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  reportId?: string;
  reportTitle?: string;
  reportTextPreview: string;
  progress: Array<{
    message: string;
    occurredAt: string;
  }>;
  submissionState: "submitting" | "submitted" | "terminal";
  cancellationRequested: boolean;
  recovered: boolean;
  error?: string;
}

export interface StartResearchRequest {
  question: string;
  scope?: string;
  confirmedPaidPreview: boolean;
}

export interface StartResearchResponse {
  run: ResearchRunSnapshot;
}

export interface ResearchRunResponse {
  run: ResearchRunSnapshot;
  report?: ResearchReport;
}

export interface ResearchRunDiscoveryResponse {
  run: ResearchRunSnapshot | null;
}
