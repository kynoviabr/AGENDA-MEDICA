import type { AiResponseSafetyDisposition, AiSafetyViolationCategory } from '../safety/domain.ts';
import type { AiConversationControlMode, AiHandoffFeatureConfig, AiHandoffPriority, AiHandoffReason, AiHandoffSource } from './domain.ts';

export function handoffPolicyForSafety(
  disposition: AiResponseSafetyDisposition,
  violations: readonly AiSafetyViolationCategory[],
): { reason: AiHandoffReason; priority: AiHandoffPriority; source: AiHandoffSource } | null {
  if (disposition !== 'require_handoff') return null;
  if (violations.includes('emergency_language')) return { reason: 'urgent_language', priority: 'urgent', source: 'safety' };
  if (violations.includes('medical_diagnosis') || violations.includes('medical_prescription')
    || violations.includes('medical_dose_advice') || violations.includes('medical_exam_interpretation')
    || violations.includes('treatment_recommendation')) {
    return { reason: 'medical_out_of_scope', priority: 'high', source: 'safety' };
  }
  if (violations.includes('external_source_write_violation')) return { reason: 'external_provider_write_unavailable', priority: 'high', source: 'tool' };
  return { reason: 'safety_fail_closed', priority: 'high', source: 'safety' };
}

export function handoffPolicyForConversation(intent: string, requiresHandoff: boolean) {
  if (!requiresHandoff) return null;
  if (intent === 'human_handoff') return { reason: 'user_requested_human' as const, priority: 'normal' as const, source: 'user_request' as const };
  if (intent === 'medical_restricted') return { reason: 'medical_out_of_scope' as const, priority: 'high' as const, source: 'conversation_engine' as const };
  return { reason: 'policy_required' as const, priority: 'normal' as const, source: 'conversation_engine' as const };
}

export function isAutomaticHandoffAllowed(config: AiHandoffFeatureConfig) {
  return config.engineMode === 'active' && config.enabled && Boolean(config.validatedAt);
}

export function canReleaseAiOutbound(
  control: { mode: AiConversationControlMode; activeHandoffId?: string | null },
  response: { requiresHandoff: boolean; handoffOperational?: boolean; handoffId?: string },
) {
  if (control.mode === 'ai_active') return true;
  return control.mode === 'handoff_pending' && response.requiresHandoff
    && response.handoffOperational === true && Boolean(response.handoffId)
    && response.handoffId === control.activeHandoffId;
}
