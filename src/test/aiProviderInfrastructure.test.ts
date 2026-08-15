import { describe, expect, it, vi } from 'vitest';
import {
  AiRateLimitError,
  AiValidationError,
  OpenAiLlmProvider,
  OpenAiTranscriptionProvider,
  OpenAiVisionProvider,
  executeAiProviderCall,
} from '@/ai';

describe('AI provider infrastructure', () => {
  it('retries only normalized transient errors', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new AiRateLimitError())
      .mockResolvedValueOnce('ok');
    await expect(executeAiProviderCall(operation, {
      timeoutMs: 50, maxAttempts: 2, retryDelayMs: 0, sleep: async () => {},
    })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry validation or safety-type failures', async () => {
    const operation = vi.fn().mockRejectedValue(new AiValidationError('bad media'));
    await expect(executeAiProviderCall(operation, {
      timeoutMs: 50, maxAttempts: 3, retryDelayMs: 0, sleep: async () => {},
    })).rejects.toMatchObject({ code: 'AI_VALIDATION_FAILED' });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('normalizes a provider timeout and limits attempts', async () => {
    const operation = vi.fn((signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    await expect(executeAiProviderCall(operation, {
      timeoutMs: 5, maxAttempts: 1,
    })).rejects.toMatchObject({ code: 'AI_TIMEOUT', retryable: true });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('uses the Responses API with structured output and no SDK dependency', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      model: 'synthetic-openai-model', status: 'completed',
      output_text: JSON.stringify({
        response_text: 'Olá!', detected_language: 'pt-BR', requires_clarification: false,
        requires_handoff: false, safety_category: 'allowed',
      }),
      usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const provider = new OpenAiLlmProvider({ apiKey: 'synthetic-test-key', fetch: fetchMock });
    const result = await provider.generate({
      model: 'synthetic-openai-model', corePolicy: 'policy', clinicContext: 'clinic', conversation: [],
      currentMessage: 'Oi', preferredLanguage: 'pt-BR', responseStyle: 'curta',
    });
    expect(result).toMatchObject({ responseText: 'Olá!', provider: 'openai', usage: { totalTokens: 5 } });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(body.tools).toBeUndefined();
    expect(body.store).toBe(false);
  });

  it('uses the isolated transcription endpoint with transient in-memory bytes', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      text: 'Áudio sintético', language: 'pt', duration: 2.5,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const provider = new OpenAiTranscriptionProvider({ apiKey: 'synthetic-test-key', fetch: fetchMock }, 'synthetic-stt');
    await expect(provider.transcribe({
      bytes: new Uint8Array([1, 2]), mimeType: 'audio/ogg', fileName: 'synthetic.ogg',
    })).resolves.toMatchObject({ text: 'Áudio sintético', model: 'synthetic-stt', durationSeconds: 2.5 });
    expect(String(fetchMock.mock.calls[0][0]).endsWith('/audio/transcriptions')).toBe(true);
    expect(fetchMock.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
  });

  it('uses structured vision output for administrative classification', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      model: 'synthetic-vision',
      output_text: JSON.stringify({ category: 'insurance_card', description: 'Carteirinha administrativa.' }),
      usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const provider = new OpenAiVisionProvider({ apiKey: 'synthetic-test-key', fetch: fetchMock }, 'synthetic-vision');
    await expect(provider.understandAdministrativeImage({
      bytes: new Uint8Array([1, 2]), mimeType: 'image/png', fileName: 'synthetic.png',
    })).resolves.toMatchObject({ category: 'insurance_card', provider: 'openai', usage: { totalTokens: 6 } });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.input[0].content[1].image_url).toMatch(/^data:image\/png;base64,/);
    expect(body.tools).toBeUndefined();
  });
});
