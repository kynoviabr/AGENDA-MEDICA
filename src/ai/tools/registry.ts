import type { AiConversationIntent } from '../domain/conversation.ts';
import type { AiToolKind, AiToolName, AiToolRequest } from './domain.ts';
import { AiToolError } from './errors.ts';

export interface AiToolDefinition {
  name: AiToolName;
  kind: AiToolKind;
  allowedIntents: readonly AiConversationIntent[];
  allowedArguments: readonly string[];
  requiredArguments: readonly string[];
}

const definitions: readonly AiToolDefinition[] = [
  { name: 'list_locations', kind: 'read', allowedIntents: ['location_question', 'scheduling_request'], allowedArguments: [], requiredArguments: [] },
  { name: 'list_professionals', kind: 'read', allowedIntents: ['professional_question', 'scheduling_request'], allowedArguments: ['locationName'], requiredArguments: [] },
  { name: 'list_services', kind: 'read', allowedIntents: ['service_question', 'price_question', 'scheduling_request'], allowedArguments: ['professionalName'], requiredArguments: [] },
  { name: 'list_insurances', kind: 'read', allowedIntents: ['insurance_question', 'scheduling_request'], allowedArguments: ['professionalName'], requiredArguments: [] },
  { name: 'get_available_slots', kind: 'read', allowedIntents: ['scheduling_request', 'reschedule_request'], allowedArguments: ['appointmentReference', 'locationName', 'professionalName', 'serviceName', 'insuranceName', 'billingType', 'dateFrom', 'dateTo'], requiredArguments: ['dateFrom', 'dateTo', 'billingType'] },
  { name: 'find_patient_appointments', kind: 'read', allowedIntents: ['confirmation_request', 'cancellation_request', 'reschedule_request'], allowedArguments: ['appointmentReference'], requiredArguments: [] },
  { name: 'create_appointment', kind: 'mutation', allowedIntents: ['scheduling_request'], allowedArguments: ['locationName', 'professionalName', 'serviceName', 'insuranceName', 'billingType', 'startAt'], requiredArguments: ['professionalName', 'billingType', 'startAt'] },
  { name: 'confirm_appointment', kind: 'mutation', allowedIntents: ['confirmation_request'], allowedArguments: ['appointmentReference'], requiredArguments: [] },
  { name: 'cancel_appointment', kind: 'mutation', allowedIntents: ['cancellation_request'], allowedArguments: ['appointmentReference', 'reason'], requiredArguments: [] },
  { name: 'reschedule_appointment', kind: 'mutation', allowedIntents: ['reschedule_request'], allowedArguments: ['appointmentReference', 'startAt'], requiredArguments: ['startAt'] },
];

export class AiToolRegistry {
  private readonly byName = new Map(definitions.map((definition) => [definition.name, definition]));

  get(name: AiToolName): AiToolDefinition {
    const definition = this.byName.get(name);
    if (!definition) throw new AiToolError('AI_TOOL_NOT_REGISTERED', 'The requested tool is not registered.');
    return definition;
  }

  validate(request: AiToolRequest): AiToolDefinition {
    if (request.schemaVersion !== 1 || !request.name || !request.intent || !request.arguments) {
      throw new AiToolError('AI_TOOL_INVALID_REQUEST', 'The tool request is invalid.');
    }
    const definition = this.get(request.name);
    if (definition.kind !== request.kind) throw new AiToolError('AI_TOOL_INVALID_REQUEST', 'The tool kind does not match its registry definition.');
    if (!definition.allowedIntents.includes(request.intent)) {
      throw new AiToolError('AI_TOOL_INTENT_NOT_ALLOWED', 'The conversation intent cannot use this tool.');
    }
    const keys = Object.keys(request.arguments);
    if (keys.some((key) => !definition.allowedArguments.includes(key))) {
      throw new AiToolError('AI_TOOL_INVALID_REQUEST', 'The tool request contains an unsupported argument.');
    }
    if (definition.requiredArguments.some((key) => !isSafeScalar(request.arguments[key]))) {
      throw new AiToolError('AI_TOOL_INVALID_REQUEST', 'The tool request is missing a required argument.');
    }
    if (Object.values(request.arguments).some((value) => value !== undefined && !isSafeScalar(value))) {
      throw new AiToolError('AI_TOOL_INVALID_REQUEST', 'Tool arguments must be bounded scalar values.');
    }
    return definition;
  }
}

function isSafeScalar(value: unknown): value is string | number | boolean {
  if (typeof value === 'string') return value.trim().length > 0 && value.length <= 240;
  return typeof value === 'number' ? Number.isFinite(value) : typeof value === 'boolean';
}
