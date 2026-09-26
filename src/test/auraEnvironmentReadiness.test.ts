import { describe, expect, it } from 'vitest';
import { AuraEnvironmentReadinessService, type RealPilotReadinessEvidence, type StagingReadinessEvidence } from '@/ai';

const staging: StagingReadinessEvidence = {
  remoteProjectClassifiedAsStaging: 'VERIFIED', stagingAppEnvironment: 'VERIFIED', stagingHealthPassed: 'VERIFIED',
  stagingSyntheticDataConfirmed: 'VERIFIED', stagingSmokePassed: 'VERIFIED', stagingKillSwitchTested: 'VERIFIED',
  criticalEvaluationPassed: 'VERIFIED', tenantPrivacyChecksPassed: 'VERIFIED',
};
const realPilot: RealPilotReadinessEvidence = {
  productionProvisioned: 'BLOCKED', productionAppEnvironment: 'BLOCKED', productionSecretsSeparated: 'BLOCKED',
  backupPolicyAccepted: 'BLOCKED', restoreTestPassed: 'BLOCKED', clinicOnboardingCompleted: 'BLOCKED', explicitRolloutApproval: 'BLOCKED',
};

describe('AuraEnvironmentReadinessService', () => {
  it('allows staging readiness without a provisioned production environment', () => {
    const result = new AuraEnvironmentReadinessService().evaluate(staging, realPilot);
    expect(result).toMatchObject({ developmentReadyForStaging: true, stagingReady: true, realPilotReady: false });
    expect(result.realPilotBlockers.some((item) => item.code === 'PRODUCTION_NOT_PROVISIONED')).toBe(true);
  });

  it('keeps incomplete staging smoke separate from real-pilot backup blockers', () => {
    const result = new AuraEnvironmentReadinessService().evaluate(
      { ...staging, stagingSmokePassed: 'BLOCKED' },
      { ...realPilot, backupPolicyAccepted: 'MANUAL_VERIFICATION_REQUIRED' },
    );
    expect(result.stagingReady).toBe(false);
    expect(result.stagingBlockers).toContainEqual({ code: 'STAGING_SMOKE_NOT_PASSED', status: 'BLOCKED' });
    expect(result.realPilotBlockers).toContainEqual({ code: 'PRODUCTION_BACKUP_POLICY_NOT_ACCEPTED', status: 'MANUAL_VERIFICATION_REQUIRED' });
  });
});
