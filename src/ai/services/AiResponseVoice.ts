import { AiConversationInterpretationError } from '../errors/AiError.ts';
import type { AiResponsePlanKind } from '../domain/conversation.ts';
import { extractOpenAiOutputText, OpenAiHttpClient, type OpenAiProviderOptions } from '../providers/openai/openAiHttp.ts';

// Plans whose text is a fixed phrase picked by code. The voice rewrites only these;
// model answers, tool replies and safety refusals keep their own wording.
export const VOICED_PLAN_KINDS: ReadonlySet<AiResponsePlanKind> = new Set(['ask_clarification', 'request_handoff', 'ready_for_tool']);

export interface AiResponseVoiceInput {
  persona: string;
  planKind: AiResponsePlanKind;
  requiredMessage: string;
  patientMessage: string;
  mustInclude?: readonly string[];
  signal?: AbortSignal;
}

export interface AiResponseVoiceOutput {
  text: string;
  provider: string;
  model: string;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  latencyMs: number;
}

export interface AiResponseVoice {
  readonly name: string;
  rewrite(input: AiResponseVoiceInput): Promise<AiResponseVoiceOutput>;
}

const PLAN_GOALS: Partial<Record<AiResponsePlanKind, string>> = {
  ask_clarification: 'Faça exatamente a pergunta da MENSAGEM_BASE, uma pergunta só, terminando com "?".',
  request_handoff: 'Avise que a conversa vai para uma pessoa da equipe. Não prometa prazo nem faça perguntas.',
  ready_for_tool: 'Confirme que entendeu o pedido e que vai verificar. Não diga que algo foi marcado nem cite horários.',
};

// Rejects rewrites that drop what the fixed phrase had to say; the caller then
// sends the fixed phrase, so a bad rewrite can only cost naturalness.
const TIME_OR_PRICE = /\d{1,2}(:|h)\d{0,2}\b|R\$\s?\d/i;

export function acceptVoicedText(
  input: Pick<AiResponseVoiceInput, 'planKind' | 'mustInclude'> & { requiredMessage?: string },
  text: string,
) {
  const value = text.trim();
  if (!value || value.length > 400) return false;
  const questions = (value.match(/\?/g) || []).length;
  if (input.planKind === 'ask_clarification' && questions !== 1) return false;
  if (input.planKind !== 'ask_clarification' && questions > 0) return false;
  if (TIME_OR_PRICE.test(value) && !TIME_OR_PRICE.test(input.requiredMessage || '')) return false;
  const normalized = fold(value);
  return (input.mustInclude || []).every((item) => normalized.includes(fold(item)));
}

function fold(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
}

export class OpenAiResponseVoice implements AiResponseVoice {
  readonly name = 'openai';
  private readonly http: OpenAiHttpClient;

  constructor(options: OpenAiProviderOptions, private readonly model: string) {
    this.http = new OpenAiHttpClient(options);
  }

  async rewrite(input: AiResponseVoiceInput): Promise<AiResponseVoiceOutput> {
    const startedAt = performance.now();
    const response = await this.http.fetch(`${this.http.baseUrl}/responses`, {
      method: 'POST', headers: this.http.headers(), signal: input.signal,
      body: JSON.stringify({
        model: this.model, store: false, max_output_tokens: 160,
        instructions: [
          input.persona,
          'Reescreva a MENSAGEM_BASE com as suas palavras, como resposta natural à última mensagem do paciente.',
          PLAN_GOALS[input.planKind] || '',
          'Pode reconhecer brevemente o que o paciente disse, sem repetir tudo.',
          'Não acrescente fatos, horários, preços, nomes de profissionais, convênios ou promessas que não estejam na MENSAGEM_BASE.',
          'Responda só com o texto da mensagem, no máximo duas frases curtas.',
        ].filter(Boolean).join('\n'),
        input: [{
          role: 'developer',
          content: `MENSAGEM_DO_PACIENTE=${JSON.stringify(input.patientMessage.slice(0, 600))}\nMENSAGEM_BASE=${JSON.stringify(input.requiredMessage)}`,
        }],
      }),
    });
    await this.http.assertOk(response);
    const payload = await response.json() as Record<string, unknown>;
    const text = extractOpenAiOutputText(payload).trim();
    if (!text) throw new AiConversationInterpretationError();
    const usage = (payload.usage || {}) as Record<string, number | undefined>;
    return {
      text, provider: 'openai', model: String(payload.model || this.model),
      usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens },
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  }
}
