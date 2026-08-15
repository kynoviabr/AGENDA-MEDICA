export type AiErrorCode =
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_RATE_LIMITED'
  | 'AI_VALIDATION_FAILED'
  | 'AI_MEDIA_PROCESSING_FAILED'
  | 'AI_TRANSCRIPTION_FAILED'
  | 'AI_VISION_FAILED'
  | 'AI_SAFETY_BLOCKED'
  | 'AI_TIMEOUT';

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  readonly originalError?: unknown;

  constructor(code: AiErrorCode, message: string, retryable = false, originalError?: unknown) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.retryable = retryable;
    this.originalError = originalError;
  }
}

export class AiProviderUnavailableError extends AiError {
  constructor(originalError?: unknown) { super('AI_PROVIDER_UNAVAILABLE', 'AI provider is temporarily unavailable.', true, originalError); }
}
export class AiRateLimitError extends AiError {
  constructor(originalError?: unknown) { super('AI_RATE_LIMITED', 'AI provider rate limit reached.', true, originalError); }
}
export class AiValidationError extends AiError {
  constructor(message = 'AI request validation failed.', originalError?: unknown) { super('AI_VALIDATION_FAILED', message, false, originalError); }
}
export class AiMediaProcessingError extends AiError {
  constructor(message = 'Media could not be processed.', originalError?: unknown) { super('AI_MEDIA_PROCESSING_FAILED', message, false, originalError); }
}
export class AiTranscriptionError extends AiError {
  constructor(originalError?: unknown) { super('AI_TRANSCRIPTION_FAILED', 'Audio transcription failed.', false, originalError); }
}
export class AiVisionError extends AiError {
  constructor(originalError?: unknown) { super('AI_VISION_FAILED', 'Image understanding failed.', false, originalError); }
}
export class AiSafetyError extends AiError {
  constructor() { super('AI_SAFETY_BLOCKED', 'Response blocked by Aura safety policy.'); }
}
export class AiTimeoutError extends AiError {
  constructor(originalError?: unknown) { super('AI_TIMEOUT', 'AI provider request timed out.', true, originalError); }
}

export function normalizeAiProviderError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') return new AiTimeoutError(error);
  return new AiProviderUnavailableError(error);
}
