import type { AiConversationResult, AiConversationState } from '../domain/conversation.ts';
import type { AiToolResult } from '../tools/domain.ts';
import type { AiHandoffReason, AiHandoffSummary } from './domain.ts';

export function buildDeterministicHandoffSummary(input: {
  reason: AiHandoffReason;
  conversation?: AiConversationResult;
  state?: AiConversationState;
  toolResult?: AiToolResult;
}): AiHandoffSummary {
  const state = input.state || input.conversation?.state;
  const entity = (key: keyof NonNullable<typeof state>['entities']) => {
    const value = state?.entities[key]?.value;
    if (typeof value === 'string') return sanitize(value);
    return undefined;
  };
  const requestedDate = state?.entities.date?.value;
  const knownAdministrativeContext = [
    entity('professional') && `Profissional: ${entity('professional')}`,
    entity('service') && `Serviço: ${entity('service')}`,
    entity('insurance') && `Convênio: ${entity('insurance')}`,
    entity('location') && `Unidade: ${entity('location')}`,
  ].filter(Boolean) as string[];
  return {
    reason: input.reason,
    patientIntent: input.conversation?.intent,
    knownAdministrativeContext,
    professional: entity('professional'), service: entity('service'), insurance: entity('insurance'),
    location: entity('location'),
    requestedDate: requestedDate && typeof requestedDate === 'object'
      ? requestedDate.resolvedDate || requestedDate.rangeStart || sanitize(requestedDate.raw)
      : undefined,
    selectedSlot: entity('selectedOption'),
    pendingAction: state?.activeIntentStatus === 'ready' ? state.activeIntent : undefined,
    lastToolOutcome: input.toolResult?.outcome,
    whatAuraAlreadyTried: [
      input.toolResult ? `Tool ${input.toolResult.toolName}: ${input.toolResult.outcome}` : undefined,
      input.conversation?.clarification ? 'Solicitou esclarecimento administrativo.' : undefined,
    ].filter(Boolean) as string[],
  };
}

function sanitize(value: string) {
  return value.slice(0, 120)
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento protegido]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[referência interna]');
}
