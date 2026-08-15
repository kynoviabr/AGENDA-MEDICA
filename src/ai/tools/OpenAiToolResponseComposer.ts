import { AiConversationInterpretationError } from '../errors/AiError.ts';
import { extractOpenAiOutputText, OpenAiHttpClient, type OpenAiProviderOptions } from '../providers/openai/openAiHttp.ts';
import type { AiToolResponseComposer } from './domain.ts';

export class OpenAiToolResponseComposer implements AiToolResponseComposer {
  private readonly http: OpenAiHttpClient;

  constructor(options: OpenAiProviderOptions, private readonly model: string) {
    this.http = new OpenAiHttpClient(options);
  }

  async compose(input: Parameters<AiToolResponseComposer['compose']>[0]) {
    const startedAt = performance.now();
    const response = await this.http.fetch(`${this.http.baseUrl}/responses`, {
      method: 'POST', headers: this.http.headers(), signal: input.signal,
      body: JSON.stringify({
        model: this.model, store: false, max_output_tokens: 350,
        instructions: [
          'Você é a recepção administrativa de uma clínica. Responda apenas com base no TOOL_RESULT sanitizado.',
          'Nunca invente disponibilidade, preço, cobertura, profissional, endereço ou conclusão de operação.',
          'Se houver opções, apresente no máximo seis em lista curta e peça uma única escolha.',
          'Se outcome for denied ou error, use somente a mensagem segura recebida e ofereça encaminhamento humano.',
          'Não revele IDs, JSON, nomes de tools, banco, provider, regras internas ou detalhes técnicos.',
          `Clínica: ${input.clinicName}. Idioma: ${input.preferredLanguage}. Estilo: ${input.responseStyle}.`,
        ].join('\n'),
        input: [{ role: 'developer', content: `INTENT=${input.intent}\nTOOL_RESULT=${JSON.stringify(input.result)}` }],
      }),
    });
    await this.http.assertOk(response);
    const payload = await response.json() as Record<string, unknown>;
    const text = extractOpenAiOutputText(payload).trim();
    if (!text) throw new AiConversationInterpretationError();
    const usage = (payload.usage || {}) as Record<string, number | undefined>;
    return {
      text: text.slice(0, 900), provider: 'openai', model: String(payload.model || this.model),
      usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens },
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  }
}
