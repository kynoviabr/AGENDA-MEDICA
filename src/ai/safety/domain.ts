import type { AiConversationResult } from '../domain/conversation.ts';
import type { AiExecutionContext, AiNormalizedMessage } from '../domain/models.ts';
import type { AiToolResult } from '../tools/domain.ts';

export type AiResponseSafetyDisposition =
  | 'allow'
  | 'rewrite_safe'
  | 'block'
  | 'require_clarification'
  | 'require_handoff';

export type AiSafetyViolationCategory =
  | 'medical_diagnosis'
  | 'medical_prescription'
  | 'medical_dose_advice'
  | 'medical_exam_interpretation'
  | 'treatment_recommendation'
  | 'unsupported_clinic_fact'
  | 'unsupported_tool_fact'
  | 'unsupported_numeric_fact'
  | 'hidden_data_exposure'
  | 'tenant_data_leak'
  | 'prompt_injection'
  | 'unsafe_knowledge_instruction'
  | 'ambiguous_action'
  | 'unconfirmed_mutation'
  | 'external_source_write_violation'
  | 'pii_overexposure'
  | 'emergency_language'
  | 'unsupported_claim';

export interface AiSafetyViolation {
  category: AiSafetyViolationCategory;
  validator: string;
  severity: 'medium' | 'high' | 'critical';
}

export interface AiGroundingSource {
  sourceType: 'tool' | 'structured_knowledge' | 'curated_knowledge' | 'application_policy' | 'user';
  clinicId?: string;
  table?: string;
  field?: string;
  verifiedAt?: string;
  published?: boolean;
  patientVisible: boolean;
}

export interface AiGroundingContext {
  toolFacts: readonly string[];
  knowledgeFacts: readonly string[];
  numericFacts: readonly string[];
  userProvidedFacts: readonly string[];
  allowedFacts: readonly string[];
  sources: readonly AiGroundingSource[];
}

export interface AiSafetyValidationInput {
  context: AiExecutionContext;
  message: AiNormalizedMessage;
  conversation: AiConversationResult;
  draftResponse: string;
  toolResult?: AiToolResult;
}

export interface AiSafetyValidationResult {
  disposition: AiResponseSafetyDisposition;
  violations: readonly AiSafetyViolation[];
  grounded: boolean;
  requiresClarification: boolean;
  requiresHandoff: boolean;
  safeResponse?: string;
  latencyMs: number;
}

export interface AiSafetyAuditEvent {
  context: AiExecutionContext;
  disposition: AiResponseSafetyDisposition;
  categories: readonly AiSafetyViolationCategory[];
  validator: string;
  grounded: boolean;
  latencyMs: number;
  occurredAt: string;
}

export interface AiSafetyAuditRecorder { record(event: AiSafetyAuditEvent): Promise<void> }
export class NoopAiSafetyAuditRecorder implements AiSafetyAuditRecorder { async record(): Promise<void> {} }
