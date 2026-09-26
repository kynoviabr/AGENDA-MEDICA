import type { AiConversationResult, AiConversationState } from '../domain/conversation.ts';
import type { AiExecutionContext } from '../domain/models.ts';
import type { AiSafetyViolationCategory } from '../safety/domain.ts';
import type { AiToolResult } from '../tools/domain.ts';

export type AiConversationControlMode = 'ai_active' | 'handoff_pending' | 'human_active' | 'ai_resume_pending' | 'closed';
export type AiHandoffStatus = 'requested' | 'queued' | 'assigned' | 'accepted' | 'resolved' | 'cancelled';
export type AiHandoffReason =
  | 'user_requested_human' | 'medical_out_of_scope' | 'urgent_language' | 'repeated_failure'
  | 'repeated_ambiguity' | 'knowledge_conflict' | 'knowledge_not_found' | 'provider_unavailable'
  | 'external_provider_write_unavailable' | 'mutation_failure' | 'identity_unresolved'
  | 'policy_required' | 'safety_fail_closed' | 'staff_manual_takeover' | 'other';
export type AiHandoffPriority = 'normal' | 'high' | 'urgent';
export type AiHandoffSource = 'conversation_engine' | 'safety' | 'tool' | 'knowledge' | 'user_request' | 'staff' | 'system';
export type AiHandoffResolution = 'resolved_by_human' | 'returned_to_ai' | 'patient_ended' | 'duplicate' | 'other';

export interface AiHandoffRequest {
  context: AiExecutionContext;
  reason: AiHandoffReason;
  priority: AiHandoffPriority;
  source: AiHandoffSource;
  requestedAt: string;
  description?: string;
  summary: AiHandoffSummary;
}

export interface AiHandoffSummary {
  reason: AiHandoffReason;
  patientIntent?: string;
  knownAdministrativeContext: readonly string[];
  professional?: string;
  service?: string;
  insurance?: string;
  location?: string;
  requestedDate?: string;
  selectedSlot?: string;
  pendingAction?: string;
  lastToolOutcome?: string;
  whatAuraAlreadyTried: readonly string[];
}

export interface AiHandoffRecord {
  id: string;
  clinicId: string;
  conversationId: string;
  reason: AiHandoffReason;
  priority: AiHandoffPriority;
  source: AiHandoffSource;
  status: AiHandoffStatus;
  assignedUserId?: string;
  requestedAt: string;
  summary: AiHandoffSummary;
}

export interface AiConversationControl {
  clinicId: string;
  conversationId: string;
  mode: AiConversationControlMode;
  activeHandoffId?: string;
  assignedUserId?: string;
  failureCount: number;
  revision: number;
}

export interface AiHandoffRepository {
  loadControl(context: AiExecutionContext): Promise<AiConversationControl>;
  request(request: AiHandoffRequest): Promise<AiHandoffRecord | null>;
  recordOperationalFailure(context: AiExecutionContext, reason: AiHandoffReason, threshold: number): Promise<AiHandoffRecord | null>;
  resetOperationalFailures(context: AiExecutionContext): Promise<void>;
}

export interface AiHandoffFeatureConfig {
  enabled: boolean;
  validatedAt?: string;
  engineMode: 'legacy' | 'shadow' | 'active';
}

export interface AiHandoffSignal {
  reason: AiHandoffReason;
  priority: AiHandoffPriority;
  source: AiHandoffSource;
  violations?: readonly AiSafetyViolationCategory[];
  conversation?: AiConversationResult;
  state?: AiConversationState;
  toolResult?: AiToolResult;
}

export const AI_HANDOFF_ACTIVE_STATUSES: readonly AiHandoffStatus[] = ['requested', 'queued', 'assigned', 'accepted'];
export const AI_HANDOFF_FAILURE_THRESHOLD = 3;

export class AiConversationSuspendedError extends Error {
  readonly code = 'AI_CONVERSATION_SUSPENDED';
  constructor(readonly mode: AiConversationControlMode) {
    super(`AI response is suspended while conversation mode is ${mode}.`);
    this.name = 'AiConversationSuspendedError';
  }
}
