import type { AiConversationMessage, AiNormalizedMessage, AiSafetyDisposition, AiUsage } from './models.ts';

export const AI_CONVERSATION_STATE_SCHEMA_VERSION = 1 as const;

export type AiConversationIntent =
  | 'greeting'
  | 'administrative_question'
  | 'scheduling_request'
  | 'reschedule_request'
  | 'cancellation_request'
  | 'confirmation_request'
  | 'waitlist_request'
  | 'professional_question'
  | 'service_question'
  | 'insurance_question'
  | 'price_question'
  | 'location_question'
  | 'human_handoff'
  | 'medical_restricted'
  | 'unknown';

export type AiConversationConfidence = 'high' | 'medium' | 'low';
export type AiEvidenceSource = 'user_text' | 'transcription' | 'image_extraction' | 'document_extraction' | 'clinic_context';
export type AiBillingType = 'private' | 'insurance';
export type AiActiveIntentStatus = 'collecting' | 'ready' | 'paused' | 'completed' | 'abandoned';

export interface AiEvidenceValue<T = string> {
  value: T;
  source: AiEvidenceSource;
  confidence: AiConversationConfidence;
  requiresConfirmation: boolean;
}

export interface AiTemporalExpression {
  raw: string;
  kind: 'exact_date' | 'relative_date' | 'weekday' | 'date_range' | 'time_only';
  resolvedDate?: string;
  rangeStart?: string;
  rangeEnd?: string;
  weekday?: number;
  timePreference?: 'morning' | 'afternoon' | 'evening' | 'any';
  afterTime?: string;
  beforeTime?: string;
  timezone: string;
}

export interface AiPresentedOption {
  id: string;
  label: string;
  value: string;
  kind: 'time' | 'professional' | 'service' | 'location' | 'insurance' | 'generic';
}

export interface AiConversationEntities {
  professional?: AiEvidenceValue;
  service?: AiEvidenceValue;
  insurance?: AiEvidenceValue;
  insuranceCandidate?: AiEvidenceValue;
  billingType?: AiEvidenceValue<AiBillingType>;
  date?: AiEvidenceValue<AiTemporalExpression>;
  location?: AiEvidenceValue;
  appointmentReference?: AiEvidenceValue;
  selectedOption?: AiEvidenceValue;
}

export interface AiConversationConstraints {
  excludedProfessionals: readonly string[];
  excludedInsurances: readonly string[];
  excludedTimePreferences: readonly string[];
}

export interface AiConversationState {
  schemaVersion: typeof AI_CONVERSATION_STATE_SCHEMA_VERSION;
  activeIntent: AiConversationIntent;
  activeIntentStatus: AiActiveIntentStatus;
  pausedIntent?: AiConversationIntent;
  entities: AiConversationEntities;
  constraints: AiConversationConstraints;
  pendingQuestion?: string;
  lastPresentedOptions: readonly AiPresentedOption[];
  lastTurnAt?: string;
}

export type AiConversationStateField = keyof AiConversationEntities;
export type AiStatePatchOperation =
  | { field: AiConversationStateField; operation: 'set'; value: AiConversationEntities[AiConversationStateField] }
  | { field: AiConversationStateField; operation: 'clear' };

export interface AiConversationStatePatch {
  operations: readonly AiStatePatchOperation[];
  addExcludedProfessionals?: readonly string[];
  addExcludedInsurances?: readonly string[];
  addExcludedTimePreferences?: readonly string[];
  clearPresentedOptions?: boolean;
  presentedOptions?: readonly AiPresentedOption[];
  intentStatus?: AiActiveIntentStatus;
}

export interface AiConversationAmbiguity {
  field: AiConversationStateField | 'reference';
  candidates: readonly string[];
  reason: string;
}

export interface AiConversationInterpretation {
  schemaVersion: 1;
  intent: AiConversationIntent;
  confidence: AiConversationConfidence;
  statePatch: AiConversationStatePatch;
  ambiguity?: AiConversationAmbiguity;
  referenceExpression?: string;
  isCorrection: boolean;
  isSmallTalk: boolean;
  endsCurrentTask: boolean;
  requiresHandoff: boolean;
  safetyDisposition: AiSafetyDisposition;
  responseText: string;
  provider: string;
  model: string;
  usage: AiUsage;
  latencyMs: number;
}

export type AiMissingField = 'professional_or_service' | 'date' | 'billing_type' | 'insurance' | 'appointment_reference';

export interface AiClarificationRequest {
  field: AiMissingField | 'ambiguity' | 'confirmation';
  question: string;
  candidates?: readonly string[];
}

export type AiResponsePlanKind =
  | 'answer'
  | 'ask_clarification'
  | 'acknowledge_correction'
  | 'request_handoff'
  | 'refuse_medical'
  | 'ready_for_tool';

export interface AiResponsePlan {
  kind: AiResponsePlanKind;
  responseText: string;
  oneQuestionOnly: boolean;
}

export interface AiConversationDecision {
  intent: AiConversationIntent;
  statePatch: AiConversationStatePatch;
  missingFields: readonly AiMissingField[];
  clarification?: AiClarificationRequest;
  referencesResolved: readonly string[];
  readyForToolExecution: boolean;
  requiresHandoff: boolean;
  safetyDisposition: AiSafetyDisposition;
  responsePlan: AiResponsePlan;
  confidence: AiConversationConfidence;
}

export interface AiConversationTurn {
  message: AiNormalizedMessage;
  previousState: AiConversationState;
  interpretation: AiConversationInterpretation;
  resultingState: AiConversationState;
  decision: AiConversationDecision;
}

export interface AiConversationResult {
  intent: AiConversationIntent;
  state: AiConversationState;
  stateRevision: number;
  stateChanged: boolean;
  missingFields: readonly AiMissingField[];
  clarification?: AiClarificationRequest;
  readyForToolExecution: boolean;
  requiresHandoff: boolean;
  safetyDisposition: AiSafetyDisposition;
  responsePlan: AiResponsePlan;
  responseText: string;
  confidence: AiConversationConfidence;
  provider: string;
  model: string;
  usage: AiUsage;
  latencyMs: number;
}

export interface AiConversationInterpreterRequest {
  state: AiConversationState;
  history: readonly AiConversationMessage[];
  message: AiNormalizedMessage;
  clinicContext: string;
  preferredLanguage: string;
  responseStyle: string;
  timezone: string;
  now: string;
  signal?: AbortSignal;
}

export interface AiConversationInterpreter {
  readonly name: string;
  interpret(request: AiConversationInterpreterRequest): Promise<AiConversationInterpretation>;
}

export interface AiPersistedConversationState {
  state: AiConversationState;
  revision: number;
}

export interface AiConversationStateRepository {
  load(clinicId: string, conversationId: string): Promise<AiPersistedConversationState>;
  saveIfRevision(
    clinicId: string,
    conversationId: string,
    expectedRevision: number,
    state: AiConversationState,
  ): Promise<AiPersistedConversationState | null>;
}

export interface AiRequiredFieldsPolicy {
  requiredFor(intent: AiConversationIntent, state: AiConversationState): readonly AiMissingField[];
}

export function createEmptyConversationState(): AiConversationState {
  return {
    schemaVersion: AI_CONVERSATION_STATE_SCHEMA_VERSION,
    activeIntent: 'unknown',
    activeIntentStatus: 'collecting',
    entities: {},
    constraints: { excludedProfessionals: [], excludedInsurances: [], excludedTimePreferences: [] },
    lastPresentedOptions: [],
  };
}
