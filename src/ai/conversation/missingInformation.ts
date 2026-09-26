import type {
  AiConversationIntent,
  AiConversationState,
  AiMissingField,
  AiRequiredFieldsPolicy,
} from '../domain/conversation.ts';

export class DefaultAiRequiredFieldsPolicy implements AiRequiredFieldsPolicy {
  requiredFor(intent: AiConversationIntent, state: AiConversationState): readonly AiMissingField[] {
    const missing: AiMissingField[] = [];
    if (intent === 'scheduling_request' || intent === 'reschedule_request' || intent === 'waitlist_request') {
      if (!state.entities.professional && !state.entities.service) missing.push('professional_or_service');
      if (!state.entities.date) missing.push('date');
      if (!state.entities.billingType) missing.push('billing_type');
      if (state.entities.billingType?.value === 'insurance' && !state.entities.insurance) missing.push('insurance');
    }
    if (intent === 'cancellation_request' || intent === 'confirmation_request') {
      if (!state.entities.appointmentReference) missing.push('appointment_reference');
    }
    if (intent === 'price_question' && !state.entities.professional && !state.entities.service) {
      missing.push('professional_or_service');
    }
    return missing;
  }
}

const QUESTIONS: Record<AiMissingField, string> = {
  professional_or_service: 'Com qual profissional ou para qual serviço você gostaria de atendimento?',
  date: 'Para qual dia você gostaria?',
  billing_type: 'Você quer atendimento particular ou por convênio?',
  insurance: 'Qual convênio você deseja usar?',
  appointment_reference: 'Qual consulta você quer alterar?',
};

export function clarificationForMissingField(field: AiMissingField): string { return QUESTIONS[field]; }
