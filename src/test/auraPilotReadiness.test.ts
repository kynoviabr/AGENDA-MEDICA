import { describe, expect, it } from 'vitest';
import { AuraPilotReadinessService, validateFeatureDependencies, type AuraPilotSnapshot } from '@/ai';

const readySnapshot: AuraPilotSnapshot = {
  appEnvironment: 'staging', globalSwitchConfigured: true, globalAiDisabled: false, databaseAvailable: true, openAiConfigured: true,
  whatsappConfigured: true, hasLocation: true, hasProfessional: true, hasService: true, hasInsurance: true,
  hasSchedulingRules: true, authorizedStaffCount: 2, publishedKnowledgeCount: 4,
  gates: { clinicEnabled: true, engineMode: 'active', readEnabled: true, readValidated: true, mutationEnabled: false, knowledgeEnabled: true, knowledgeValidated: true, handoffEnabled: true, handoffValidated: true },
};

describe('AuraPilotReadinessService', () => {
  it('returns structured ready result without enabling anything', () => {
    const result = new AuraPilotReadinessService().evaluate(readySnapshot);
    expect(result.ready).toBe(true);
    expect(result.stage).toBe('handoff');
    expect(result.blockers).toEqual([]);
  });

  it('blocks unknown environment, global disable and missing dependencies', () => {
    const result = new AuraPilotReadinessService().evaluate({ ...readySnapshot, appEnvironment: 'unknown', globalAiDisabled: true, whatsappConfigured: false });
    expect(result.ready).toBe(false);
    expect(result.blockers.map((item) => item.code)).toEqual(expect.arrayContaining(['APP_ENV_MISSING', 'GLOBAL_AI_DISABLED', 'WHATSAPP_NOT_CONFIGURED']));
  });

  it('blocks a clinic-level disable', () => {
    const result = new AuraPilotReadinessService().evaluate({ ...readySnapshot, gates: { ...readySnapshot.gates, clinicEnabled: false } });
    expect(result.blockers.some((item) => item.code === 'CLINIC_AI_DISABLED')).toBe(true);
  });

  it('does not approve a real pilot in local or without an explicit global switch', () => {
    const result = new AuraPilotReadinessService().evaluate({ ...readySnapshot, appEnvironment: 'local', globalSwitchConfigured: false });
    expect(result.blockers.map((item) => item.code)).toEqual(expect.arrayContaining(['PILOT_ENVIRONMENT_LOCAL', 'GLOBAL_SWITCH_NOT_CONFIGURED']));
  });

  it('detects unsafe feature dependencies', () => {
    const snapshot = { ...readySnapshot, authorizedStaffCount: 0, gates: { ...readySnapshot.gates, engineMode: 'legacy' as const, readValidated: false, knowledgeValidated: false, handoffValidated: false, mutationEnabled: true } };
    expect(validateFeatureDependencies(snapshot)).toEqual(expect.arrayContaining([
      'READ_REQUIRES_SHADOW_OR_ACTIVE', 'MUTATION_REQUIRES_ACTIVE_VALIDATED_READ',
      'KNOWLEDGE_REQUIRES_ACTIVE_VALIDATED_READ', 'HANDOFF_REQUIRES_ACTIVE_VALIDATION_AND_STAFF',
    ]));
  });

  it('keeps warnings separate from blockers', () => {
    const result = new AuraPilotReadinessService().evaluate({ ...readySnapshot, hasInsurance: false, publishedKnowledgeCount: 0, gates: { ...readySnapshot.gates, knowledgeEnabled: false, handoffEnabled: false } });
    expect(result.warnings.map((item) => item.code)).toEqual(expect.arrayContaining(['NO_ACTIVE_INSURANCE', 'LOW_KNOWLEDGE_COVERAGE', 'HANDOFF_AUTOMATION_DISABLED']));
  });
});
