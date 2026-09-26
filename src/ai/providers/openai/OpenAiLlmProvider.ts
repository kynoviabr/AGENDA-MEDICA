import type { AiLlmProvider, AiLlmRequest, AiLlmResult } from '../contracts.ts';
import { AiValidationError } from '../../errors/AiError.ts';
import { extractOpenAiOutputText, OpenAiHttpClient, type OpenAiProviderOptions } from './openAiHttp.ts';

type AuraStructuredResponse = {
  response_text: string;
  detected_language: string;
  requires_clarification: boolean;
  requires_handoff: boolean;
  safety_category: 'allowed' | 'administrative_only' | 'clinical_content_restricted' | 'requires_handoff';
};

export class OpenAiLlmProvider implements AiLlmProvider {
  readonly name = 'openai';
  private readonly http: OpenAiHttpClient;

  constructor(options: OpenAiProviderOptions) { this.http = new OpenAiHttpClient(options); }

  async generate(request: AiLlmRequest): Promise<AiLlmResult> {
    const input = [
      ...request.conversation.map((item) => ({ role: item.role, content: item.text })),
      { role: 'user', content: request.currentMessage },
    ];
    const response = await this.http.fetch(`${this.http.baseUrl}/responses`, {
      method: 'POST',
      headers: this.http.headers(),
      body: JSON.stringify({
        model: request.model,
        instructions: [
          request.corePolicy,
          `Idioma preferencial: ${request.preferredLanguage}.`,
          `Estilo de resposta: ${request.responseStyle}.`,
          request.clinicContext,
        ].join('\n\n'),
        input,
        max_output_tokens: 300,
        store: false,
        text: {
          format: {
            type: 'json_schema', name: 'aura_ai_response', strict: true,
            schema: {
              type: 'object', additionalProperties: false,
              properties: {
                response_text: { type: 'string' },
                detected_language: { type: 'string' },
                requires_clarification: { type: 'boolean' },
                requires_handoff: { type: 'boolean' },
                safety_category: {
                  type: 'string',
                  enum: ['allowed', 'administrative_only', 'clinical_content_restricted', 'requires_handoff'],
                },
              },
              required: ['response_text', 'detected_language', 'requires_clarification', 'requires_handoff', 'safety_category'],
            },
          },
        },
      }),
      signal: request.signal,
    });
    await this.http.assertOk(response);
    const payload = await response.json() as Record<string, unknown>;
    const outputText = extractOpenAiOutputText(payload);
    let structured: AuraStructuredResponse;
    try { structured = JSON.parse(outputText) as AuraStructuredResponse; }
    catch (error) { throw new AiValidationError('OpenAI returned invalid structured output.', error); }
    if (!structured.response_text?.trim()) throw new AiValidationError('OpenAI returned an empty response.');
    const usage = (payload.usage || {}) as Record<string, number | undefined>;
    return {
      responseText: structured.response_text,
      provider: this.name,
      model: String(payload.model || request.model),
      finishReason: typeof payload.status === 'string' ? payload.status : undefined,
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        totalTokens: usage.total_tokens,
      },
      detectedLanguage: structured.detected_language || undefined,
      requiresClarification: structured.requires_clarification,
      requiresHandoff: structured.requires_handoff,
      safetyDisposition: structured.safety_category,
    };
  }
}
