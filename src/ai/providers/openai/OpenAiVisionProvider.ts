import { AiValidationError } from '../../errors/AiError.ts';
import type { AiBinaryInput, AiVisionProvider, AiVisionResult } from '../contracts.ts';
import { bytesToBase64, extractOpenAiOutputText, OpenAiHttpClient, type OpenAiProviderOptions } from './openAiHttp.ts';

export class OpenAiVisionProvider implements AiVisionProvider {
  readonly name = 'openai';
  private readonly http: OpenAiHttpClient;

  constructor(options: OpenAiProviderOptions, private readonly model = 'gpt-5.6-luna') {
    this.http = new OpenAiHttpClient(options);
  }

  async understandAdministrativeImage(input: AiBinaryInput, signal?: AbortSignal): Promise<AiVisionResult> {
    const response = await this.http.fetch(`${this.http.baseUrl}/responses`, {
      method: 'POST', headers: this.http.headers(), signal,
      body: JSON.stringify({
        model: this.model,
        instructions: [
          'Classifique e descreva somente o conteúdo administrativo visível.',
          'Se for foto clínica ou resultado de exame, não diagnostique, não interprete e use uma descrição genérica.',
          'Não transcreva números completos de documento, carteirinha, telefone ou outros identificadores sensíveis.',
        ].join('\n'),
        input: [{ role: 'user', content: [
          { type: 'input_text', text: 'Classifique esta imagem para triagem administrativa.' },
          { type: 'input_image', image_url: `data:${input.mimeType};base64,${bytesToBase64(input.bytes)}` },
        ] }],
        store: false,
        text: { format: {
          type: 'json_schema', name: 'aura_image_understanding', strict: true,
          schema: {
            type: 'object', additionalProperties: false,
            properties: {
              category: { type: 'string', enum: [
                'administrative_document', 'insurance_card', 'appointment_document', 'medical_order',
                'exam_result', 'clinical_photo', 'unrelated', 'unknown',
              ] },
              description: { type: 'string' },
            },
            required: ['category', 'description'],
          },
        } },
      }),
    });
    await this.http.assertOk(response);
    const payload = await response.json() as Record<string, unknown>;
    let structured: { category: AiVisionResult['category']; description: string };
    try { structured = JSON.parse(extractOpenAiOutputText(payload)); }
    catch (error) { throw new AiValidationError('OpenAI returned invalid image classification.', error); }
    const usage = (payload.usage || {}) as Record<string, number | undefined>;
    return {
      description: structured.description,
      category: structured.category,
      provider: this.name,
      model: String(payload.model || this.model),
      usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens },
    };
  }
}
