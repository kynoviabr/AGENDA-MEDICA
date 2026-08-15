export interface AiModelConfiguration {
  llmModel: string;
  transcriptionModel: string;
  visionModel: string;
  historyLimit: number;
  llmTimeoutMs: number;
}

export const DEFAULT_AI_MODEL_CONFIGURATION: AiModelConfiguration = {
  llmModel: 'gpt-5.6-luna',
  transcriptionModel: 'gpt-4o-mini-transcribe',
  visionModel: 'gpt-5.6-luna',
  historyLimit: 10,
  llmTimeoutMs: 30_000,
};
