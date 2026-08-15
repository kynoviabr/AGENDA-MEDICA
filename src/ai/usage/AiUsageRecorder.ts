import type { AiExecutionContext, AiMessageType } from '../domain/models.ts';

export type AiUsageRequestType = 'llm_response' | 'conversation_interpretation' | 'transcription' | 'vision' | 'document_preprocessing';

export interface AiUsageEvent {
  context: AiExecutionContext;
  messageType: AiMessageType;
  requestType: AiUsageRequestType;
  provider: string;
  model?: string;
  inputUnits?: number;
  outputUnits?: number;
  totalUnits?: number;
  preprocessingLatencyMs?: number;
  providerLatencyMs?: number;
  totalLatencyMs: number;
  outcome: 'success' | 'error';
  errorCode?: string;
  occurredAt: string;
}

export interface AiUsageRecorder {
  record(event: AiUsageEvent): Promise<void>;
}

export class NoopAiUsageRecorder implements AiUsageRecorder {
  async record(_event: AiUsageEvent): Promise<void> {}
}
