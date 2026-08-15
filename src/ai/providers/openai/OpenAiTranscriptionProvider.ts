import { AiTranscriptionError } from '../../errors/AiError.ts';
import type { AiBinaryInput, AiTranscriptionProvider, AiTranscriptionResult } from '../contracts.ts';
import { OpenAiHttpClient, type OpenAiProviderOptions } from './openAiHttp.ts';

export class OpenAiTranscriptionProvider implements AiTranscriptionProvider {
  readonly name = 'openai';
  private readonly http: OpenAiHttpClient;

  constructor(options: OpenAiProviderOptions, private readonly model = 'gpt-4o-mini-transcribe') {
    this.http = new OpenAiHttpClient(options);
  }

  async transcribe(input: AiBinaryInput, signal?: AbortSignal): Promise<AiTranscriptionResult> {
    const form = new FormData();
    form.append('model', this.model);
    form.append('response_format', 'json');
    form.append('file', new Blob([input.bytes], { type: input.mimeType }), input.fileName || 'voice-message');
    const response = await this.http.fetch(`${this.http.baseUrl}/audio/transcriptions`, {
      method: 'POST', headers: { Authorization: this.http.headers().Authorization }, body: form, signal,
    });
    await this.http.assertOk(response);
    const payload = await response.json() as Record<string, unknown>;
    if (typeof payload.text !== 'string') throw new AiTranscriptionError();
    return {
      text: payload.text,
      provider: this.name,
      model: this.model,
      language: typeof payload.language === 'string' ? payload.language : undefined,
      durationSeconds: typeof payload.duration === 'number' ? payload.duration : undefined,
      usageUnits: typeof payload.duration === 'number' ? payload.duration : undefined,
    };
  }
}
