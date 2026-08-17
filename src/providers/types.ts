import type {
  AuthoritativeContentBlock,
  ProviderMetadata,
  RawUrlCitation,
} from "@/types/report";
import type {
  ProviderStatus,
  ResearchEvent,
} from "@/types/research";

export interface ProviderSubmission {
  interactionId: string;
  providerStatus: ProviderStatus;
  createdAt?: string;
}

export class ResearchProviderTerminalError extends Error {
  constructor(
    message: string,
    readonly providerStatus: ProviderStatus,
  ) {
    super(message);
    this.name = "ResearchProviderTerminalError";
  }
}

export interface ProviderCallbacks {
  onEvent: (event: ResearchEvent) => Promise<void>;
  isCancellationRequested: () => boolean;
}

export interface ProviderResearchResult {
  provider: ProviderMetadata;
  interactionId?: string;
  providerStatus: string;
  lastEventId?: string;
  contentBlocks: AuthoritativeContentBlock[];
  rawAnnotations: RawUrlCitation[];
  createdAt?: string;
  completedAt: string;
}

export interface ResearchLifecycleProvider {
  create(
    question: string,
    scope: string,
  ): Promise<ProviderSubmission>;
  resume(
    interactionId: string,
    lastEventId: string | undefined,
    callbacks: ProviderCallbacks,
  ): Promise<ProviderResearchResult>;
  cancel(interactionId: string): Promise<void>;
}
