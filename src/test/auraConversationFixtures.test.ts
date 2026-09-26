import { describe, expect, it } from 'vitest';
import {
  AURA_CONVERSATION_EVAL_FIXTURES,
  AuraConversationEngine,
  FakeAiConversationHistoryLoader,
  FakeConversationInterpreter,
  InMemoryAiConversationStateRepository,
  conversationInterpretation,
  setBilling,
  setDate,
  setText,
  type AiConversationStatePatch,
  type AiNormalizedMessage,
} from '@/ai';

describe('Aura reusable conversation evaluation fixtures', () => {
  it.each(AURA_CONVERSATION_EVAL_FIXTURES)('$name', async (fixture) => {
    const repository = new InMemoryAiConversationStateRepository();
    const interpreter = new FakeConversationInterpreter((request) => {
      const text = request.message.normalizedText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const operations: AiConversationStatePatch['operations'][number][] = [];
      if (/amanha|sexta/.test(text)) operations.push(setDate(text.includes('amanha') ? 'amanhã' : 'sexta'));
      if (/tarde/.test(text) && !/amanha|sexta/.test(text)) operations.push(setDate('à tarde'));
      if (/ana/.test(text)) operations.push(setText('professional', 'Dra Ana'));
      if (/unimed/.test(text)) operations.push(setText('insurance', 'Unimed'), setBilling('insurance'));
      if (/dermatologista/.test(text)) operations.push(setText('service', 'Dermatologia'));
      return conversationInterpretation('scheduling_request', { operations }, {
        safetyDisposition: /mancha/.test(text) ? 'clinical_content_restricted' : 'allowed',
      });
    });
    const engine = new AuraConversationEngine(
      interpreter, repository, new FakeAiConversationHistoryLoader(), undefined,
      { now: () => new Date('2026-08-15T15:00:00.000Z'), executionPolicy: { timeoutMs: 50, maxAttempts: 1 } },
    );
    for (const [index, text] of fixture.turns.entries()) {
      const message: AiNormalizedMessage = {
        clinicId: 'clinic-fixture', conversationId: 'conversation-fixture', originalMessageId: `turn-${index}`,
        originalType: 'text', normalizedText: text, attachments: [],
        understandingMetadata: { needsClarification: false }, processingMetrics: [], preprocessingLatencyMs: 0,
      };
      await engine.process({
        clinicId: 'clinic-fixture', conversationId: 'conversation-fixture', channel: 'whatsapp',
        correlationId: `00000000-0000-4000-8000-0000000000${index + 10}`,
      }, message, {
        clinicId: 'clinic-fixture', clinicName: 'Fixture Clinic', enabled: true,
        preferredLanguage: 'pt-BR', responseStyle: 'curta', timezone: 'America/Sao_Paulo',
      }, 'Clínica de avaliação sintética.');
    }
    const state = repository.snapshot().state;
    expect(state.activeIntent).toBe(fixture.expectedIntent);
    for (const field of fixture.expectedKnownFields) {
      expect(state.entities).toHaveProperty(field);
    }
  });
});
