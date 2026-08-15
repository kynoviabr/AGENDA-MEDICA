import { describe, expect, it } from 'vitest';
import {
  AuraAiOrchestrator,
  AiMessageIngestionService,
  AiTranscriptionError,
  FakeAiClinicConfigLoader,
  FakeAiConversationHistoryLoader,
  FakeLlmProvider,
  InMemoryAiUsageRecorder,
  WhatsappAuraAiBridge,
  decideWhatsappAiExecution,
  type AiExecutionContext,
  type AiNormalizedMessage,
} from '@/ai';

const context: AiExecutionContext = {
  clinicId: 'clinic-a', conversationId: 'conversation-a', channel: 'whatsapp',
  correlationId: '00000000-0000-4000-8000-000000000001', leadId: 'synthetic-lead',
};
const normalized: AiNormalizedMessage = {
  clinicId: 'clinic-a', conversationId: 'conversation-a', originalMessageId: 'message-a', originalType: 'text',
  normalizedText: 'Oi', attachments: [], understandingMetadata: { needsClarification: false },
  processingMetrics: [], preprocessingLatencyMs: 1,
};

function orchestrator(provider = new FakeLlmProvider(), history = new FakeAiConversationHistoryLoader()) {
  const usage = new InMemoryAiUsageRecorder();
  return {
    provider, usage,
    value: new AuraAiOrchestrator(
      provider,
      new FakeAiClinicConfigLoader({
        clinicId: 'clinic-a', clinicName: 'Clínica Sintética', enabled: true,
        preferredLanguage: 'pt-BR', responseStyle: 'curta e acolhedora',
      }),
      history,
      usage,
      { model: 'fake-model', executionPolicy: { timeoutMs: 50, maxAttempts: 1 } },
    ),
  };
}

describe('AuraAiOrchestrator', () => {
  it('produces a short natural response through a provider-neutral LLM', async () => {
    const { value, usage } = orchestrator();
    await expect(value.respond(context, normalized)).resolves.toMatchObject({
      text: 'Olá! Como posso ajudar?', provider: 'fake_llm', safetyDisposition: 'allowed',
    });
    expect(usage.events).toEqual([expect.objectContaining({ requestType: 'llm_response', outcome: 'success' })]);
    expect(usage.events[0].context.clinicId).toBe('clinic-a');
  });

  it('filters history from another clinic and conversation before invoking the provider', async () => {
    const history = new FakeAiConversationHistoryLoader([
      { clinicId: 'clinic-b', conversationId: 'conversation-b', role: 'user', text: 'SEGREDO B' },
      { clinicId: 'clinic-a', conversationId: 'conversation-a', role: 'assistant', text: 'Histórico A' },
    ]);
    const { value, provider } = orchestrator(new FakeLlmProvider(), history);
    await value.respond(context, normalized);
    expect(provider.requests[0].conversation).toEqual([
      { clinicId: 'clinic-a', conversationId: 'conversation-a', role: 'assistant', text: 'Histórico A' },
    ]);
    expect(JSON.stringify(provider.requests[0])).not.toContain('SEGREDO B');
  });

  it('rejects a normalized message from another tenant before loading context', async () => {
    const { value } = orchestrator();
    await expect(value.respond(context, { ...normalized, clinicId: 'clinic-b' })).rejects.toMatchObject({
      code: 'AI_VALIDATION_FAILED',
    });
  });

  it('does not invent whether the clinic accepts Unimed when no fact was supplied', async () => {
    const { value, provider } = orchestrator();
    const response = await value.respond(context, { ...normalized, normalizedText: 'Vocês atendem Unimed?' });
    expect(response.text).toContain('confirmar');
    expect(provider.requests).toHaveLength(0);
  });

  it('does not diagnose a lesion', async () => {
    const { value } = orchestrator();
    const response = await value.respond(context, { ...normalized, normalizedText: 'Essa mancha parece câncer?' });
    expect(response.text).toContain('Não consigo avaliar ou diagnosticar');
    expect(response.requiresHandoff).toBe(true);
  });

  it('does not recommend doubling medication dosage', async () => {
    const { value } = orchestrator();
    const response = await value.respond(context, { ...normalized, normalizedText: 'Tomei um remédio, devo dobrar a dose?' });
    expect(response.text).toContain('Não posso orientar dose');
    expect(response.safetyDisposition).toBe('clinical_content_restricted');
  });

  it('records audio preprocessing and LLM usage with the same correlation id', async () => {
    const { value, usage } = orchestrator();
    await value.respond(context, {
      ...normalized, originalType: 'audio', processingMetrics: [{
        requestType: 'transcription', provider: 'fake_transcription', model: 'fake-stt', latencyMs: 12, succeeded: true,
      }],
    });
    expect(usage.events).toHaveLength(2);
    expect(usage.events.every((event) => event.context.correlationId === context.correlationId)).toBe(true);
    expect(usage.events.map((event) => event.requestType)).toEqual(['transcription', 'llm_response']);
  });

  it('keeps legacy as default and guarantees exactly one outbound engine in every mode', () => {
    expect(decideWhatsappAiExecution('legacy')).toEqual({ runLegacy: true, runAura: false, sendLegacy: true, sendAura: false });
    expect(decideWhatsappAiExecution('shadow')).toEqual({ runLegacy: true, runAura: true, sendLegacy: true, sendAura: false });
    expect(decideWhatsappAiExecution('active')).toEqual({ runLegacy: false, runAura: true, sendLegacy: false, sendAura: true });
    for (const mode of ['legacy', 'shadow', 'active'] as const) {
      const decision = decideWhatsappAiExecution(mode);
      expect(Number(decision.sendLegacy) + Number(decision.sendAura)).toBe(1);
    }
  });

  it('accounts for ingestion failures without storing media content', async () => {
    const usage = new InMemoryAiUsageRecorder();
    const failingProcessor = { process: async () => { throw new AiTranscriptionError(); } };
    const ingestion = new AiMessageIngestionService({
      text: failingProcessor, audio: failingProcessor, image: failingProcessor, document: failingProcessor,
    });
    const bridge = new WhatsappAuraAiBridge(ingestion, orchestrator().value, usage);
    await expect(bridge.process(context, {
      id: 'audio-failure', clinicId: 'clinic-a', conversationId: 'conversation-a', channel: 'whatsapp',
      senderId: 'synthetic', messageType: 'audio', receivedAt: '2026-08-15T20:00:00.000Z',
      media: { mediaId: 'technical-media-id', mimeType: 'audio/ogg', kind: 'audio', source: 'whatsapp' },
    })).rejects.toMatchObject({ code: 'AI_TRANSCRIPTION_FAILED' });
    expect(usage.events).toEqual([expect.objectContaining({
      requestType: 'transcription', outcome: 'error', errorCode: 'AI_TRANSCRIPTION_FAILED',
    })]);
    expect(JSON.stringify(usage.events)).not.toContain('technical-media-id');
  });
});
