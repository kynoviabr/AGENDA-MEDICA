import {
  AI_CONVERSATION_STATE_SCHEMA_VERSION,
  type AiConversationState,
  type AiConversationStatePatch,
  type AiEvidenceValue,
  type AiTemporalExpression,
} from '../domain/conversation.ts';
import { AiConversationStateError } from '../errors/AiError.ts';

const MAX_STATE_BYTES = 16 * 1024;

function unique(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(-20);
}

export function validateConversationState(state: AiConversationState): void {
  if (state.schemaVersion !== AI_CONVERSATION_STATE_SCHEMA_VERSION) {
    throw new AiConversationStateError('Unsupported conversation state schema version.');
  }
  if (new TextEncoder().encode(JSON.stringify(state)).byteLength > MAX_STATE_BYTES) {
    throw new AiConversationStateError('Conversation state exceeds the 16 KB limit.');
  }
  for (const option of state.lastPresentedOptions) {
    if (!option.id || !option.label || !option.value) throw new AiConversationStateError('Presented option is invalid.');
  }
}

export function mergeConversationState(
  current: AiConversationState,
  patch: AiConversationStatePatch,
  turnAt: string,
): AiConversationState {
  const entities = { ...current.entities };
  for (const operation of patch.operations) {
    if (operation.operation === 'clear') delete entities[operation.field];
    else if (operation.field === 'date' && entities.date) {
      const dateValue = operation.value as AiEvidenceValue<AiTemporalExpression>;
      const nextTemporal = dateValue.value;
      const onlyRefinesTime = !nextTemporal.resolvedDate && !nextTemporal.rangeStart && nextTemporal.weekday === undefined
        && Boolean(nextTemporal.timePreference || nextTemporal.afterTime || nextTemporal.beforeTime);
      entities.date = onlyRefinesTime ? {
        ...dateValue,
        value: {
          ...entities.date.value,
          timePreference: nextTemporal.timePreference || entities.date.value.timePreference,
          afterTime: nextTemporal.afterTime || entities.date.value.afterTime,
          beforeTime: nextTemporal.beforeTime || entities.date.value.beforeTime,
          raw: `${entities.date.value.raw}; ${nextTemporal.raw}`,
        },
      } : dateValue;
    } else entities[operation.field] = operation.value as AiEvidenceValue<never>;
  }
  const next: AiConversationState = {
    ...current,
    schemaVersion: AI_CONVERSATION_STATE_SCHEMA_VERSION,
    entities,
    constraints: {
      excludedProfessionals: unique([...current.constraints.excludedProfessionals, ...(patch.addExcludedProfessionals || [])]),
      excludedInsurances: unique([...current.constraints.excludedInsurances, ...(patch.addExcludedInsurances || [])]),
      excludedTimePreferences: unique([...current.constraints.excludedTimePreferences, ...(patch.addExcludedTimePreferences || [])]),
    },
    activeIntentStatus: patch.intentStatus || current.activeIntentStatus,
    lastPresentedOptions: patch.clearPresentedOptions ? [] : (patch.presentedOptions || current.lastPresentedOptions),
    lastTurnAt: turnAt,
  };
  validateConversationState(next);
  return next;
}

export function conversationStateEquals(a: AiConversationState, b: AiConversationState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
