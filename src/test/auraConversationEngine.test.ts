import { describe, expect, it } from 'vitest';
import {
  AuraConversationEngine,
  FakeAiConversationHistoryLoader,
  FakeConversationInterpreter,
  InMemoryAiConversationStateRepository,
  InMemoryAiUsageRecorder,
  AiConversationInterpretationError,
  conversationInterpretation,
  createEmptyConversationState,
  resolveTemporalExpression,
  setBilling,
  setDate,
  setText,
  type AiConversationInterpretation,
  type AiConversationState,
  type AiExecutionContext,
  type AiNormalizedMessage,
} from '@/ai';

const context: AiExecutionContext = {
  clinicId: 'clinic-a', conversationId: 'conversation-a', channel: 'whatsapp',
  correlationId: '00000000-0000-4000-8000-000000000056',
};
const config = {
  clinicId: 'clinic-a', clinicName: 'Clínica Sintética', enabled: true,
  preferredLanguage: 'pt-BR', responseStyle: 'curta e acolhedora', timezone: 'America/Sao_Paulo',
};

function message(text: string, originalType: AiNormalizedMessage['originalType'] = 'text'): AiNormalizedMessage {
  return {
    clinicId: 'clinic-a', conversationId: 'conversation-a', originalMessageId: crypto.randomUUID(),
    originalType, normalizedText: text, attachments: [], understandingMetadata: { needsClarification: false },
    processingMetrics: [], preprocessingLatencyMs: 1,
  };
}

function engine(
  interpretation: AiConversationInterpretation | ((text: string) => AiConversationInterpretation),
  state = createEmptyConversationState(),
) {
  const repository = new InMemoryAiConversationStateRepository(state);
  const usage = new InMemoryAiUsageRecorder();
  const interpreter = new FakeConversationInterpreter((request) => typeof interpretation === 'function'
    ? interpretation(request.message.normalizedText)
    : interpretation);
  const value = new AuraConversationEngine(interpreter, repository, new FakeAiConversationHistoryLoader(), usage, {
    now: () => new Date('2026-08-15T15:00:00.000Z'), executionPolicy: { timeoutMs: 50, maxAttempts: 1 },
  });
  return { value, repository, interpreter, usage };
}

async function turn(value: AuraConversationEngine, text: string, type: AiNormalizedMessage['originalType'] = 'text') {
  return value.process(context, message(text, type), config, 'Clínica: Sintética.');
}

describe('AuraConversationEngine', () => {
  it('detects missing information and asks only the most important question', async () => {
    const date = resolveTemporalExpression('amanhã', '2026-08-15T15:00:00.000Z', 'America/Sao_Paulo');
    const result = await turn(engine(conversationInterpretation('scheduling_request', { operations: [setDate(date)] })).value, 'Quero marcar amanhã');
    expect(result.state.entities.date?.value.resolvedDate).toBe('2026-08-16');
    expect(result.missingFields).toContain('professional_or_service');
    expect(result.responseText).toBe('Com qual profissional ou para qual serviço você gostaria de atendimento?');
    expect((result.responseText.match(/\?/g) || [])).toHaveLength(1);
    expect(result.readyForToolExecution).toBe(false);
  });

  it('preserves previous fields through incremental follow-ups', async () => {
    const { value } = engine((text) => text.includes('amanhã')
      ? conversationInterpretation('scheduling_request', { operations: [setDate('amanhã')] })
      : conversationInterpretation('scheduling_request', { operations: [setText('professional', 'Dra Ana')] }));
    await turn(value, 'Quero amanhã');
    const result = await turn(value, 'Com a Dra Ana');
    expect(result.state.entities.date?.value.raw).toBe('amanhã');
    expect(result.state.entities.professional?.value).toBe('Dra Ana');
    expect(result.missingFields).toEqual(['billing_type']);
  });

  it('applies an elliptical time preference without replacing the known date', async () => {
    const { value } = engine((text) => text === 'sexta'
      ? conversationInterpretation('scheduling_request', { operations: [setDate('sexta')] })
      : conversationInterpretation('scheduling_request', { operations: [setDate('à tarde')] }));
    const first = await turn(value, 'sexta');
    const second = await turn(value, 'à tarde');
    expect(second.state.entities.date?.value.resolvedDate).toBe(first.state.entities.date?.value.resolvedDate);
    expect(second.state.entities.date?.value.timePreference).toBe('afternoon');
  });

  it('overwrites only the corrected date', async () => {
    const initial = createEmptyConversationState();
    initial.activeIntent = 'scheduling_request';
    initial.entities = {
      date: setDate('sexta').value,
      professional: setText('professional', 'Dra Ana').value,
      insurance: setText('insurance', 'Unimed').value,
    };
    const result = await turn(engine(conversationInterpretation('scheduling_request', { operations: [setDate('quinta')] }, {
      isCorrection: true, responseText: 'Perfeito, quinta-feira.',
    }), initial).value, 'Não, sexta não. Quinta.');
    expect(result.state.entities.date?.value.raw).toBe('quinta');
    expect(result.state.entities.professional?.value).toBe('Dra Ana');
    expect(result.state.entities.insurance?.value).toBe('Unimed');
  });

  it('changes billing to private and deterministically clears insurance', async () => {
    const initial = createEmptyConversationState();
    initial.activeIntent = 'scheduling_request';
    initial.entities = { billingType: setBilling('insurance').value, insurance: setText('insurance', 'Unimed').value };
    const result = await turn(engine(conversationInterpretation('scheduling_request', { operations: [setBilling('private')] }, {
      isCorrection: true, responseText: 'Perfeito, particular.',
    }), initial).value, 'Na verdade é particular');
    expect(result.state.entities.billingType?.value).toBe('private');
    expect(result.state.entities.insurance).toBeUndefined();
  });

  it.each([['o segundo', '15:00'], ['o último', '16:30']] as const)('resolves ordinal reference %s', async (expression, expected) => {
    const initial = createEmptyConversationState();
    initial.lastPresentedOptions = [
      { id: 'one', label: '14:00', value: '14:00', kind: 'time' },
      { id: 'two', label: '15:00', value: '15:00', kind: 'time' },
      { id: 'three', label: '16:30', value: '16:30', kind: 'time' },
    ];
    const result = await turn(engine(conversationInterpretation('scheduling_request', { operations: [] }, {
      referenceExpression: expression,
    }), initial).value, expression);
    expect(result.state.entities.selectedOption?.value).toBe(expected);
  });

  it('does not silently select an ambiguous professional', async () => {
    const result = await turn(engine(conversationInterpretation('scheduling_request', { operations: [] }, {
      ambiguity: { field: 'professional', candidates: ['Dra Ana Paula', 'Dra Ana Carla'], reason: 'partial name' },
    })).value, 'Quero com a Ana');
    expect(result.clarification?.candidates).toEqual(['Dra Ana Paula', 'Dra Ana Carla']);
    expect(result.state.entities.professional).toBeUndefined();
  });

  it('records negation as a constraint without selecting the negated entity', async () => {
    const result = await turn(engine(conversationInterpretation('scheduling_request', {
      operations: [], addExcludedProfessionals: ['Dra Ana'],
    })).value, 'Não quero com a Dra Ana');
    expect(result.state.entities.professional).toBeUndefined();
    expect(result.state.constraints.excludedProfessionals).toContain('Dra Ana');
  });

  it('structures date and after-time preference in clinic timezone', async () => {
    const result = await turn(engine(conversationInterpretation('scheduling_request', {
      operations: [setDate('amanhã depois das quatro')],
    })).value, 'amanhã depois das quatro');
    expect(result.state.entities.date?.value).toMatchObject({ resolvedDate: '2026-08-16', afterTime: '16:00', timezone: 'America/Sao_Paulo' });
  });

  it('resolves relative dates from the message timestamp rather than processing time', async () => {
    const setup = engine(conversationInterpretation('scheduling_request', { operations: [setDate('amanhã')] }));
    const inbound = message('amanhã');
    inbound.receivedAt = '2026-08-10T15:00:00.000Z';
    const result = await setup.value.process(context, inbound, config, 'Clínica: Sintética.');
    expect(result.state.entities.date?.value.resolvedDate).toBe('2026-08-11');
    expect(result.state.lastTurnAt).toBe('2026-08-10T15:00:00.000Z');
  });

  it('refines next-week range to Wednesday without retaining two active dates', async () => {
    const { value } = engine((text) => text.includes('semana que vem')
      ? conversationInterpretation('scheduling_request', { operations: [setDate('semana que vem')] })
      : conversationInterpretation('scheduling_request', { operations: [setDate('quarta da semana que vem')] }, { isCorrection: true }));
    await turn(value, 'semana que vem');
    const result = await turn(value, 'na quarta');
    expect(result.state.entities.date?.value).toMatchObject({ raw: 'quarta da semana que vem', resolvedDate: '2026-08-19' });
  });

  it('keeps operational state when the patient thanks the receptionist', async () => {
    const initial = readySchedulingState();
    const result = await turn(engine(conversationInterpretation('greeting', { operations: [] }, {
      isSmallTalk: true, responseText: 'Por nada! Se precisar, estou por aqui.',
    }), initial).value, 'Obrigado');
    expect(result.state.activeIntent).toBe('scheduling_request');
    expect(result.state.entities.professional?.value).toBe('Dra Ana');
  });

  it('answers a temporary insurance question without destroying the active scheduling state', async () => {
    const initial = readySchedulingState();
    const result = await turn(engine(conversationInterpretation('insurance_question', { operations: [] }, {
      responseText: 'A equipe precisa confirmar a cobertura da Unimed.',
    }), initial).value, 'Vocês atendem Unimed?');
    expect(result.intent).toBe('insurance_question');
    expect(result.state.activeIntent).toBe('scheduling_request');
    expect(result.responseText).toContain('confirmar');
  });

  it('preserves medical restriction and does not diagnose', async () => {
    const result = await turn(engine(conversationInterpretation('medical_restricted', { operations: [] }, {
      safetyDisposition: 'clinical_content_restricted', requiresHandoff: true,
    })).value, 'Essa pinta parece câncer?');
    expect(result.safetyDisposition).toBe('clinical_content_restricted');
    expect(result.responseText).toContain('Não consigo');
    expect(result.responseText.toLowerCase()).not.toContain('é câncer');
  });

  it('keeps the administrative intent in mixed medical and scheduling content', async () => {
    const result = await turn(engine(conversationInterpretation('scheduling_request', {
      operations: [setText('service', 'Dermatologia')],
    }, { safetyDisposition: 'clinical_content_restricted' })).value, 'Essa mancha parece estranha e quero marcar com dermatologista');
    expect(result.intent).toBe('scheduling_request');
    expect(result.state.entities.service?.value).toBe('Dermatologia');
    expect(result.responseText.toLowerCase()).toContain('não consigo avaliar');
  });

  it('detects explicit human handoff without implementing a handoff engine', async () => {
    const result = await turn(engine(conversationInterpretation('human_handoff', { operations: [] }, {
      requiresHandoff: true, safetyDisposition: 'requires_handoff',
    })).value, 'Quero falar com uma pessoa');
    expect(result.requiresHandoff).toBe(true);
    expect(result.responsePlan.kind).toBe('request_handoff');
  });

  it('does not ask again for an insurance already known', async () => {
    const initial = readySchedulingState();
    const result = await turn(engine(conversationInterpretation('scheduling_request'), initial).value, 'Pode continuar');
    expect(result.missingFields).toEqual([]);
    expect(result.responseText).not.toContain('Qual convênio');
    expect(result.readyForToolExecution).toBe(true);
  });

  it('treats audio transcript exactly like equivalent typed text', async () => {
    const interpretation = conversationInterpretation('scheduling_request', {
      operations: [setDate('sexta'), setText('professional', 'Dra Ana'), setBilling('private')],
    });
    const typed = await turn(engine(interpretation).value, 'sexta à tarde com a dra ana particular', 'text');
    const audio = await turn(engine(interpretation).value, 'sexta à tarde com a dra ana particular', 'audio');
    expect(audio.state.entities.date?.value.raw).toBe(typed.state.entities.date?.value.raw);
    expect(audio.state.entities.professional?.value).toBe(typed.state.entities.professional?.value);
    expect(audio.state.entities.professional?.source).toBe('transcription');
  });

  it('keeps insurance extracted from an image as a candidate until confirmation', async () => {
    const result = await turn(engine(conversationInterpretation('scheduling_request', {
      operations: [setText('insuranceCandidate', 'Unimed', 'image_extraction')],
    })).value, 'Carteirinha de convênio: Unimed', 'image');
    expect(result.state.entities.insuranceCandidate).toMatchObject({ value: 'Unimed', requiresConfirmation: true });
    expect(result.state.entities.insurance).toBeUndefined();
    expect(result.clarification?.field).toBe('confirmation');
  });

  it('retries an optimistic state conflict without invoking the interpreter twice', async () => {
    const setup = engine(conversationInterpretation('scheduling_request', { operations: [setDate('amanhã')] }));
    setup.repository.conflictsRemaining = 1;
    const result = await turn(setup.value, 'Quero amanhã');
    expect(setup.repository.saveCalls).toBe(2);
    expect(setup.interpreter.requests).toHaveLength(1);
    expect(result.stateRevision).toBe(2);
  });

  it('does not persist a partial patch when structured interpretation is invalid', async () => {
    const setup = engine(conversationInterpretation('greeting'));
    const failing = new AuraConversationEngine(
      new FakeConversationInterpreter(new AiConversationInterpretationError()),
      setup.repository, new FakeAiConversationHistoryLoader(), setup.usage,
      { executionPolicy: { timeoutMs: 50, maxAttempts: 1 } },
    );
    await expect(turn(failing, 'mensagem inválida')).rejects.toMatchObject({ code: 'AI_CONVERSATION_INTERPRETATION_FAILED' });
    expect(setup.repository.snapshot()).toMatchObject({ revision: 0, state: { activeIntent: 'unknown' } });
  });

  it('resets stale completed operational context when a new primary task starts', async () => {
    const initial = readySchedulingState();
    initial.activeIntentStatus = 'completed';
    initial.lastTurnAt = '2026-08-10T10:00:00.000Z';
    const result = await turn(engine(conversationInterpretation('cancellation_request', {
      operations: [setText('appointmentReference', 'consulta de amanhã')],
    }), initial).value, 'Quero cancelar a consulta de amanhã');
    expect(result.state.activeIntent).toBe('cancellation_request');
    expect(result.state.entities.professional).toBeUndefined();
    expect(result.state.entities.appointmentReference?.value).toBe('consulta de amanhã');
  });

  it('records conversation interpretation usage without message or state content', async () => {
    const setup = engine(conversationInterpretation('greeting', { operations: [] }, { isSmallTalk: true, responseText: 'Olá!' }));
    await turn(setup.value, 'Meu texto sensível');
    expect(setup.usage.events).toEqual([expect.objectContaining({ requestType: 'conversation_interpretation', outcome: 'success' })]);
    expect(JSON.stringify(setup.usage.events)).not.toContain('Meu texto sensível');
  });
});

function readySchedulingState(): AiConversationState {
  const state = createEmptyConversationState();
  state.activeIntent = 'scheduling_request';
  state.entities = {
    professional: setText('professional', 'Dra Ana').value,
    date: setDate('amanhã').value,
    billingType: setBilling('insurance').value,
    insurance: setText('insurance', 'Unimed').value,
  };
  return state;
}
