import { describe, expect, it } from 'vitest';
import {
  AuraAiOrchestrator,
  AuraConversationEngine,
  FakeAiClinicConfigLoader,
  FakeAiConversationHistoryLoader,
  FakeConversationInterpreter,
  InMemoryAiConversationStateRepository,
  InMemoryAiUsageRecorder,
  acceptVoicedText,
  conversationInterpretation,
  type AiExecutionContext,
  type AiNormalizedMessage,
  type AiResponseVoice,
  type AiResponseVoiceInput,
} from '@/ai';

const context: AiExecutionContext = {
  clinicId: 'clinic-a', conversationId: 'conversation-a', channel: 'whatsapp',
  correlationId: '00000000-0000-4000-8000-000000000002', leadId: 'synthetic-lead',
};
const message: AiNormalizedMessage = {
  clinicId: 'clinic-a', conversationId: 'conversation-a', originalMessageId: 'message-a', originalType: 'text',
  normalizedText: 'queria marcar uma consulta pra minha mãe', attachments: [], understandingMetadata: { needsClarification: false },
  processingMetrics: [], preprocessingLatencyMs: 1,
};

class FakeVoice implements AiResponseVoice {
  readonly name = 'fake_voice';
  readonly inputs: AiResponseVoiceInput[] = [];
  constructor(private readonly reply: string | Error) {}
  async rewrite(input: AiResponseVoiceInput) {
    this.inputs.push(input);
    if (this.reply instanceof Error) throw this.reply;
    return { text: this.reply, provider: 'fake_voice', model: 'fake', usage: {}, latencyMs: 1 };
  }
}

function build(voice: AiResponseVoice | undefined, intent: Parameters<typeof conversationInterpretation>[0] = 'scheduling_request', responseText = 'Claro!') {
  const usage = new InMemoryAiUsageRecorder();
  const engine = new AuraConversationEngine(
    new FakeConversationInterpreter(conversationInterpretation(intent, { operations: [] }, { responseText })),
    new InMemoryAiConversationStateRepository(), new FakeAiConversationHistoryLoader(), usage,
    { executionPolicy: { timeoutMs: 50, maxAttempts: 1 } },
  );
  const orchestrator = new AuraAiOrchestrator(engine, new FakeAiClinicConfigLoader({
    clinicId: 'clinic-a', clinicName: 'Clínica Sintética', enabled: true, assistantName: 'Lia',
    preferredLanguage: 'pt-BR', responseStyle: 'curta e acolhedora', timezone: 'America/Sao_Paulo',
  }), usage, { responseVoice: voice, responseVoiceTimeoutMs: 50 });
  return { orchestrator, usage };
}

describe('assistant voice for fixed phrases', () => {
  it('sends the missing-data question in the assistant own words', async () => {
    const voice = new FakeVoice('Claro, vamos marcar para ela! Com qual profissional ou especialidade seria?');
    const { orchestrator, usage } = build(voice);
    const response = await orchestrator.respond(context, message);
    expect(response.text).toBe('Claro, vamos marcar para ela! Com qual profissional ou especialidade seria?');
    expect(voice.inputs[0]).toMatchObject({ planKind: 'ask_clarification', patientMessage: message.normalizedText });
    expect(voice.inputs[0].persona).toContain('Você é Lia');
    expect(usage.events).toContainEqual(expect.objectContaining({ requestType: 'llm_response', outcome: 'success' }));
  });

  it('keeps the fixed question when the rewrite drops the question', async () => {
    const { orchestrator } = build(new FakeVoice('Claro, vou ver isso para você.'));
    const response = await orchestrator.respond(context, message);
    expect(response.text).toBe('Com qual profissional ou para qual serviço você gostaria de atendimento?');
  });

  it('keeps the fixed phrase when the voice fails', async () => {
    const { orchestrator, usage } = build(new FakeVoice(new Error('offline')));
    const response = await orchestrator.respond(context, message);
    expect(response.text).toBe('Com qual profissional ou para qual serviço você gostaria de atendimento?');
    expect(usage.events).toContainEqual(expect.objectContaining({ requestType: 'llm_response', outcome: 'error' }));
  });

  it('leaves model answers untouched', async () => {
    const voice = new FakeVoice('não deveria aparecer');
    const { orchestrator } = build(voice, 'greeting', 'Oi! Tudo bem? Em que posso ajudar?');
    const response = await orchestrator.respond(context, { ...message, normalizedText: 'oi' });
    expect(response.text).toBe('Oi! Tudo bem? Em que posso ajudar?');
    expect(voice.inputs).toHaveLength(0);
  });
});

describe('acceptVoicedText', () => {
  it('requires exactly one question for clarifications', () => {
    expect(acceptVoicedText({ planKind: 'ask_clarification' }, 'Para qual dia seria?')).toBe(true);
    expect(acceptVoicedText({ planKind: 'ask_clarification' }, 'Qual dia? E horário?')).toBe(false);
  });

  it('rejects invented times and prices', () => {
    expect(acceptVoicedText({ planKind: 'ask_clarification' }, 'Pode ser às 14h?')).toBe(false);
    expect(acceptVoicedText({ planKind: 'ready_for_tool' }, 'Fica R$ 200, vou verificar.')).toBe(false);
  });

  it('requires every option the patient has to choose from', () => {
    const input = { planKind: 'ask_clarification' as const, mustInclude: ['Dra. Ana', 'Dra. Bia'] };
    expect(acceptVoicedText(input, 'Seria com a Dra. Ana ou com a Dra. Bia?')).toBe(true);
    expect(acceptVoicedText(input, 'Seria com a Dra. Ana?')).toBe(false);
  });

  it('keeps the handoff notice free of questions', () => {
    expect(acceptVoicedText({ planKind: 'request_handoff' }, 'Combinado, já chamei alguém da equipe para falar com você.')).toBe(true);
    expect(acceptVoicedText({ planKind: 'request_handoff' }, 'Posso chamar alguém?')).toBe(false);
  });
});

describe('acceptVoicedText with times already offered', () => {
  it('allows times that were in the fixed phrase', () => {
    const input = { planKind: 'ask_clarification' as const, requiredMessage: 'Encontrei mais de uma opção: 14h ou 15h. Qual delas você prefere?', mustInclude: ['14h', '15h'] };
    expect(acceptVoicedText(input, 'Tenho 14h e 15h, qual fica melhor?')).toBe(true);
  });
});
