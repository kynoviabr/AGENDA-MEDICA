import { AiError, AiTimeoutError, normalizeAiProviderError } from '../errors/AiError.ts';

export interface AiProviderExecutionPolicy {
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function executeAiProviderCall<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  policy: AiProviderExecutionPolicy,
): Promise<T> {
  const attempts = Math.max(1, policy.maxAttempts);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
    try {
      return await operation(controller.signal);
    } catch (error) {
      const normalized = controller.signal.aborted ? new AiTimeoutError(error) : normalizeAiProviderError(error);
      if (!normalized.retryable || attempt === attempts) throw normalized;
      await (policy.sleep || defaultSleep)(policy.retryDelayMs ?? 100);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new AiError('AI_PROVIDER_UNAVAILABLE', 'AI provider execution failed.', true);
}
