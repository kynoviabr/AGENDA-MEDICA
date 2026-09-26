import { aggregateHealth } from './health.ts';
import type { AppEnvironment, HealthCheckResult, HealthSummary } from './domain.ts';

export type PilotStage = 'legacy' | 'shadow' | 'active_read' | 'knowledge' | 'handoff' | 'mutation';
export interface PilotReadinessIssue { code: string; message: string; check: string }
export interface AuraPilotSnapshot {
  appEnvironment: AppEnvironment;
  globalSwitchConfigured: boolean;
  globalAiDisabled: boolean;
  databaseAvailable: boolean;
  openAiConfigured: boolean;
  whatsappConfigured: boolean;
  hasLocation: boolean;
  hasProfessional: boolean;
  hasService: boolean;
  hasInsurance: boolean;
  hasOperatingHours: boolean;
  hasSchedulingRules: boolean;
  authorizedStaffCount: number;
  publishedKnowledgeCount: number;
  gates: {
    clinicEnabled: boolean;
    engineMode: 'legacy' | 'shadow' | 'active';
    readEnabled: boolean; readValidated: boolean;
    mutationEnabled: boolean;
    knowledgeEnabled: boolean; knowledgeValidated: boolean;
    handoffEnabled: boolean; handoffValidated: boolean;
  };
}
export interface PilotReadinessResult {
  ready: boolean;
  stage: PilotStage;
  health: HealthSummary;
  checks: readonly HealthCheckResult[];
  blockers: readonly PilotReadinessIssue[];
  warnings: readonly PilotReadinessIssue[];
}

function stageOf(snapshot: AuraPilotSnapshot): PilotStage {
  if (snapshot.gates.mutationEnabled) return 'mutation';
  if (snapshot.gates.handoffEnabled) return 'handoff';
  if (snapshot.gates.knowledgeEnabled) return 'knowledge';
  if (snapshot.gates.engineMode === 'active') return 'active_read';
  return snapshot.gates.engineMode;
}

export class AuraPilotReadinessService {
  evaluate(snapshot: AuraPilotSnapshot): PilotReadinessResult {
    const checks: HealthCheckResult[] = [
      { key: 'environment', state: snapshot.appEnvironment === 'unknown' || snapshot.appEnvironment === 'local' ? 'unhealthy' : 'healthy', required: true, code: snapshot.appEnvironment === 'unknown' ? 'APP_ENV_MISSING' : snapshot.appEnvironment === 'local' ? 'PILOT_ENVIRONMENT_LOCAL' : 'APP_ENV_VALID' },
      { key: 'database', state: snapshot.databaseAvailable ? 'healthy' : 'unhealthy', required: true, code: snapshot.databaseAvailable ? 'DATABASE_AVAILABLE' : 'DATABASE_UNAVAILABLE' },
      { key: 'global_switch_configuration', state: snapshot.globalSwitchConfigured ? 'healthy' : 'unhealthy', required: true, code: snapshot.globalSwitchConfigured ? 'GLOBAL_SWITCH_CONFIGURED' : 'GLOBAL_SWITCH_NOT_CONFIGURED' },
      { key: 'global_switch', state: snapshot.globalAiDisabled ? 'unhealthy' : 'healthy', required: true, code: snapshot.globalAiDisabled ? 'GLOBAL_AI_DISABLED' : 'GLOBAL_AI_ENABLED' },
      { key: 'whatsapp', state: snapshot.whatsappConfigured ? 'healthy' : 'unhealthy', required: true, code: snapshot.whatsappConfigured ? 'WHATSAPP_CONFIGURED' : 'WHATSAPP_NOT_CONFIGURED' },
      { key: 'openai_configuration', state: snapshot.openAiConfigured ? 'healthy' : 'degraded', required: snapshot.gates.engineMode !== 'legacy', code: snapshot.openAiConfigured ? 'OPENAI_CONFIGURED' : 'OPENAI_NOT_CONFIGURED' },
      { key: 'catalog', state: snapshot.hasLocation && snapshot.hasProfessional && snapshot.hasService ? 'healthy' : 'unhealthy', required: true, code: 'CLINIC_CATALOG' },
      { key: 'operating_hours', state: snapshot.hasOperatingHours ? 'healthy' : 'unhealthy', required: true, code: snapshot.hasOperatingHours ? 'OPERATING_HOURS_CONFIGURED' : 'OPERATING_HOURS_NOT_CONFIGURED' },
      { key: 'scheduling', state: snapshot.hasSchedulingRules ? 'healthy' : 'unhealthy', required: true, code: snapshot.hasSchedulingRules ? 'SCHEDULING_CONFIGURED' : 'SCHEDULING_NOT_CONFIGURED' },
      { key: 'staff', state: snapshot.authorizedStaffCount > 0 ? 'healthy' : 'unhealthy', required: snapshot.gates.handoffEnabled, code: snapshot.authorizedStaffCount > 0 ? 'AUTHORIZED_STAFF_AVAILABLE' : 'NO_AUTHORIZED_STAFF' },
    ];
    const blockers: PilotReadinessIssue[] = checks.filter((check) => check.required && check.state === 'unhealthy').map((check) => ({ code: check.code, message: check.code, check: check.key }));
    const invalid = validateFeatureDependencies(snapshot);
    blockers.push(...invalid.map((code) => ({ code, message: code, check: 'feature_gates' })));
    if (!snapshot.gates.clinicEnabled) blockers.push({ code: 'CLINIC_AI_DISABLED', message: 'CLINIC_AI_DISABLED', check: 'clinic_gate' });
    const warnings: PilotReadinessIssue[] = [];
    if (!snapshot.hasInsurance) warnings.push({ code: 'NO_ACTIVE_INSURANCE', message: 'NO_ACTIVE_INSURANCE', check: 'catalog' });
    if (snapshot.publishedKnowledgeCount === 0) warnings.push({ code: 'LOW_KNOWLEDGE_COVERAGE', message: 'LOW_KNOWLEDGE_COVERAGE', check: 'knowledge' });
    if (!snapshot.gates.handoffEnabled) warnings.push({ code: 'HANDOFF_AUTOMATION_DISABLED', message: 'HANDOFF_AUTOMATION_DISABLED', check: 'handoff' });
    return { ready: blockers.length === 0, stage: stageOf(snapshot), health: aggregateHealth(checks), checks, blockers, warnings };
  }
}

export function validateFeatureDependencies(snapshot: AuraPilotSnapshot) {
  const codes: string[] = [];
  const gates = snapshot.gates;
  if (gates.readEnabled && gates.engineMode === 'legacy') codes.push('READ_REQUIRES_SHADOW_OR_ACTIVE');
  if (gates.mutationEnabled && (gates.engineMode !== 'active' || !gates.readEnabled || !gates.readValidated)) codes.push('MUTATION_REQUIRES_ACTIVE_VALIDATED_READ');
  if (gates.knowledgeEnabled && (gates.engineMode !== 'active' || !gates.knowledgeValidated || !gates.readEnabled || !gates.readValidated)) codes.push('KNOWLEDGE_REQUIRES_ACTIVE_VALIDATED_READ');
  if (gates.handoffEnabled && (gates.engineMode !== 'active' || !gates.handoffValidated || snapshot.authorizedStaffCount < 1)) codes.push('HANDOFF_REQUIRES_ACTIVE_VALIDATION_AND_STAFF');
  return codes;
}
