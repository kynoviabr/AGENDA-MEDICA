import type { AiConversationState, AiTemporalExpression } from '../domain/conversation.ts';
import type { AiToolPlanner, AiToolRequest } from './domain.ts';

function value(state: AiConversationState, key: keyof AiConversationState['entities']): string | undefined {
  const item = state.entities[key];
  return item && typeof item.value === 'string' ? item.value : undefined;
}

function temporal(state: AiConversationState): AiTemporalExpression | undefined {
  const item = state.entities.date?.value;
  return item && typeof item === 'object' ? item : undefined;
}

function request(name: AiToolRequest['name'], kind: AiToolRequest['kind'], intent: AiToolRequest['intent'], args: Record<string, unknown>): AiToolRequest {
  return { schemaVersion: 1, name, kind, intent, arguments: Object.fromEntries(Object.entries(args).filter(([, item]) => item !== undefined)) };
}

export class ConversationStateToolPlanner implements AiToolPlanner {
  plan({ context, intent, state, messageText = '' }: Parameters<AiToolPlanner['plan']>[0]): AiToolRequest | null {
    void context;
    const professionalName = value(state, 'professional');
    const serviceName = value(state, 'service');
    const insuranceName = value(state, 'insurance');
    const locationName = value(state, 'location');
    const appointmentReference = value(state, 'appointmentReference');
    const selected = value(state, 'selectedOption');
    const billingType = state.entities.billingType?.value;
    const date = temporal(state);

    const knowledgeArgs = { query: messageText, locationName, professionalName, serviceName, insuranceName };
    if (intent === 'administrative_question' || (intent === 'location_question' && isAdministrativeKnowledgeQuestion(messageText))) {
      return request('search_administrative_knowledge', 'read', intent, knowledgeArgs);
    }
    if (intent === 'professional_question' && isAdministrativeKnowledgeQuestion(messageText)) {
      return request('search_administrative_knowledge', 'read', intent, knowledgeArgs);
    }
    if (intent === 'service_question' && isAdministrativeKnowledgeQuestion(messageText)) {
      return request('search_administrative_knowledge', 'read', intent, knowledgeArgs);
    }
    if (intent === 'insurance_question' && isAdministrativeKnowledgeQuestion(messageText)) {
      return request('search_administrative_knowledge', 'read', intent, knowledgeArgs);
    }
    if (intent === 'professional_question') return request('list_professionals', 'read', intent, { locationName });
    if (intent === 'location_question') return request('list_locations', 'read', intent, {});
    if (intent === 'service_question' || intent === 'price_question') return request('list_services', 'read', intent, { professionalName });
    if (intent === 'insurance_question') return request('list_insurances', 'read', intent, { professionalName });

    if (intent === 'scheduling_request') {
      if (selected && selected.includes('T')) return request('create_appointment', 'mutation', intent, {
        locationName, professionalName, serviceName, insuranceName, billingType, startAt: selected,
      });
      const dateFrom = date?.resolvedDate || date?.rangeStart;
      const dateTo = date?.resolvedDate || date?.rangeEnd;
      return request('get_available_slots', 'read', intent, {
        locationName, professionalName, serviceName, insuranceName, billingType, dateFrom, dateTo,
      });
    }

    if (intent === 'reschedule_request' && selected && selected.includes('T')) {
      return request('reschedule_appointment', 'mutation', intent, { appointmentReference, startAt: selected });
    }
    if (intent === 'confirmation_request') return request('confirm_appointment', 'mutation', intent, { appointmentReference: appointmentReference || selected });
    if (intent === 'cancellation_request') return request('cancel_appointment', 'mutation', intent, { appointmentReference: appointmentReference || selected, reason: 'Cancelamento solicitado pelo paciente via Aura IA' });
    if (intent === 'reschedule_request') {
      const dateFrom = date?.resolvedDate || date?.rangeStart;
      const dateTo = date?.resolvedDate || date?.rangeEnd;
      return request('get_available_slots', 'read', intent, { appointmentReference: appointmentReference || selected, billingType: billingType || 'private', dateFrom, dateTo });
    }
    return null;
  }
}

function isAdministrativeKnowledgeQuestion(value: string) {
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  return /\b(preparo|orientacao|documento|acompanhante|crianca|primeira consulta|pagamento|atraso|cancelamento|estacionamento|acessibilidade|horario|endereco|funciona|politica|autorizacao)\b/.test(text);
}
