import type {
  AiConversationMessage,
  AiImageCategory,
  AiSafetyDisposition,
  AiUsage,
} from '../domain/models.ts';

export interface AiBinaryInput {
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}

export interface AiLlmRequest {
  model: string;
  corePolicy: string;
  clinicContext: string;
  conversation: readonly AiConversationMessage[];
  currentMessage: string;
  preferredLanguage: string;
  responseStyle: string;
  signal?: AbortSignal;
}

export interface AiLlmResult {
  responseText: string;
  provider: string;
  model: string;
  finishReason?: string;
  usage: AiUsage;
  detectedLanguage?: string;
  requiresClarification: boolean;
  requiresHandoff: boolean;
  safetyDisposition: AiSafetyDisposition;
}

export interface AiLlmProvider {
  readonly name: string;
  generate(request: AiLlmRequest): Promise<AiLlmResult>;
}

export interface AiTranscriptionResult {
  text: string;
  provider: string;
  model: string;
  language?: string;
  durationSeconds?: number;
  usageUnits?: number;
}

export interface AiTranscriptionProvider {
  readonly name: string;
  transcribe(input: AiBinaryInput, signal?: AbortSignal): Promise<AiTranscriptionResult>;
}

export interface AiVisionResult {
  description: string;
  category: AiImageCategory;
  provider: string;
  model: string;
  usage: AiUsage;
}

export interface AiVisionProvider {
  readonly name: string;
  understandAdministrativeImage(input: AiBinaryInput, signal?: AbortSignal): Promise<AiVisionResult>;
}

export interface AiLoadedMedia extends AiBinaryInput {
  size: number;
}

export interface AiMediaLoader {
  load(mediaId: string, signal?: AbortSignal): Promise<AiLoadedMedia>;
}
