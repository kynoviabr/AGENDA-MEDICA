import { describe, expect, it } from 'vitest';
import {
  AuraAiOrchestrator, AuraConversationEngine, AuraHandoffService,
  FakeAiClinicConfigLoader, FakeAiConversationHistoryLoader, FakeConversationInterpreter,
  InMemoryAiConversationStateRepository, InMemoryAiHandoffRepository, conversationInterpretation,
} from '@/ai';

const context = { clinicId: 'clinic-synthetic', conversationId: 'conversation-synthetic', correlationId: 'correlation-synthetic', channel: 'whatsapp' as const };
const message = (text: string) => ({
  clinicId: context.clinicId, conversationId: context.conversationId, originalMessageId: `message-${text.length}`,
  originalType: 'text' as const, normalizedText: text, attachments: [],
  understandingMetadata: { needsClarification: false }, processingMetrics: [], preprocessingLatencyMs: 0,
});

function setup(intent: 'human_handoff' | 'greeting' = 'human_handoff') {
  const repository = new InMemoryAiHandoffRepository(context.clinicId, context.conversationId);
  const interpreter = new FakeConversationInterpreter(conversationInterpretation(intent, { operations: [] }, {
    requiresHandoff: intent === 'human_handoff', responseText: intent === 'human_handoff' ? 'Vou encaminhar para a equipe.' : 'Olá!',
  }));
  const engine = new AuraConversationEngine(interpreter, new InMemoryAiConversationStateRepository(), new FakeAiConversationHistoryLoader());
  const orchestrator = new AuraAiOrchestrator(
    engine,
    new FakeAiClinicConfigLoader({
      clinicId: context.clinicId, clinicName: 'Clínica Sintética', enabled: true,
      preferredLanguage: 'pt-BR', responseStyle: 'curta',
      handoff: { engineMode: 'active', enabled: true, validatedAt: '2026-08-16T00:00:00.000Z' },
    }),
    undefined, {}, undefined, undefined, undefined, new AuraHandoffService(repository),
  );
  return { orchestrator, repository, interpreter };
}

describe('Aura handoff orchestrator integration', () => {
  it('turns an explicit human request into one operational handoff', async () => {
    const { orchestrator, repository } = setup();
    const response = await orchestrator.respond(context, message('quero falar com uma pessoa'));
    expect(response).toMatchObject({ requiresHandoff: true, handoffOperational: true });
    expect(repository.handoffs).toHaveLength(1);
    expect(repository.handoffs[0]).toMatchObject({ reason: 'user_requested_human', status: 'queued' });
    expect(repository.control.mode).toBe('handoff_pending');
  });

  it('creates urgent priority while preserving the immediate safety response', async () => {
    const { orchestrator, repository, interpreter } = setup('greeting');
    const response = await orchestrator.respond(context, message('não consigo respirar'));
    expect(response).toMatchObject({ requiresHandoff: true, handoffOperational: true });
    expect(response.text).toContain('192');
    expect(repository.handoffs[0].priority).toBe('urgent');
    expect(interpreter.requests).toHaveLength(0);
  });

  it('stops the AI pipeline on subsequent inbound while handoff is active', async () => {
    const { orchestrator, interpreter } = setup();
    await orchestrator.respond(context, message('quero falar com uma pessoa'));
    await expect(orchestrator.respond({ ...context, correlationId: 'second' }, message('ainda estou aqui')))
      .rejects.toMatchObject({ code: 'AI_CONVERSATION_SUSPENDED' });
    expect(interpreter.requests).toHaveLength(1);
  });
});
