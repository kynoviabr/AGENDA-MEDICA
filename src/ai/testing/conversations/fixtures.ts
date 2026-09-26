import type {
  AiConversationInterpretation,
  AiConversationIntent,
  AiConversationStatePatch,
  AiEvidenceSource,
  AiTemporalExpression,
} from '../../domain/conversation.ts';

export interface AiConversationEvalFixture {
  name: string;
  turns: readonly string[];
  expectedIntent: AiConversationIntent;
  expectedKnownFields: readonly string[];
}

export const AURA_CONVERSATION_EVAL_FIXTURES: readonly AiConversationEvalFixture[] = [
  { name: 'single natural scheduling turn', turns: ['amanhã à tarde com a dra ana pela unimed'], expectedIntent: 'scheduling_request', expectedKnownFields: ['date', 'professional', 'billingType', 'insurance'] },
  { name: 'incremental scheduling turn', turns: ['sexta', 'à tarde', 'com a ana', 'unimed'], expectedIntent: 'scheduling_request', expectedKnownFields: ['date', 'professional', 'billingType', 'insurance'] },
  { name: 'medical plus administrative', turns: ['essa mancha parece estranha e quero marcar com dermatologista'], expectedIntent: 'scheduling_request', expectedKnownFields: ['service'] },
];

export function conversationInterpretation(
  intent: AiConversationIntent,
  statePatch: AiConversationStatePatch = { operations: [] },
  overrides: Partial<AiConversationInterpretation> = {},
): AiConversationInterpretation {
  return {
    schemaVersion: 1, intent, confidence: 'high', statePatch,
    isCorrection: false, isSmallTalk: false, endsCurrentTask: false,
    requiresHandoff: false, safetyDisposition: 'allowed', responseText: 'Claro, vou continuar por aqui.',
    provider: 'fake_conversation', model: 'fake-conversation-v1', usage: {}, latencyMs: 1,
    ...overrides,
  };
}

export function setText(field: 'professional' | 'service' | 'insurance' | 'insuranceCandidate' | 'location' | 'appointmentReference' | 'selectedOption', value: string, source: AiEvidenceSource = 'user_text') {
  return { field, operation: 'set' as const, value: { value, source, confidence: 'high' as const, requiresConfirmation: false } };
}

export function setBilling(value: 'private' | 'insurance', source: AiEvidenceSource = 'user_text') {
  return { field: 'billingType' as const, operation: 'set' as const, value: { value, source, confidence: 'high' as const, requiresConfirmation: false } };
}

export function setDate(value: AiTemporalExpression | string, source: AiEvidenceSource = 'user_text') {
  const temporal = typeof value === 'string'
    ? { raw: value, kind: 'relative_date' as const, timezone: 'America/Sao_Paulo' }
    : value;
  return { field: 'date' as const, operation: 'set' as const, value: { value: temporal, source, confidence: 'high' as const, requiresConfirmation: false } };
}
