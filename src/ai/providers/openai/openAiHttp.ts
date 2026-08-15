import {
  AiProviderUnavailableError,
  AiRateLimitError,
  AiValidationError,
} from '../../errors/AiError.ts';

export type AiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OpenAiProviderOptions {
  apiKey: string;
  fetch?: AiFetch;
  baseUrl?: string;
}

export class OpenAiHttpClient {
  readonly fetch: AiFetch;
  readonly baseUrl: string;

  constructor(private readonly options: OpenAiProviderOptions) {
    if (!options.apiKey) throw new AiValidationError('OpenAI API key is required by the backend adapter.');
    this.fetch = options.fetch || globalThis.fetch.bind(globalThis);
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
  }

  headers(contentType = 'application/json'): Record<string, string> {
    return { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': contentType };
  }

  async assertOk(response: Response): Promise<void> {
    if (response.ok) return;
    if (response.status === 429) throw new AiRateLimitError();
    if (response.status >= 500) throw new AiProviderUnavailableError();
    throw new AiValidationError(`OpenAI request rejected with status ${response.status}.`);
  }
}

export function extractOpenAiOutputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string') return payload.output_text.trim();
  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const value of content as Array<Record<string, unknown>>) {
      if (typeof value.text === 'string') parts.push(value.text);
    }
  }
  return parts.join('\n').trim();
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
