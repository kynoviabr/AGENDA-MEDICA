import { describe, expect, it } from 'vitest';
import { PlatformPilotReadinessService, type PlatformPilotEvidence } from '@/ai';

const verified: PlatformPilotEvidence = {
  stagingDatabaseSeparated: 'VERIFIED',
  stagingApplicationSeparated: 'VERIFIED',
  stagingAppEnvironment: 'VERIFIED',
  productionAppEnvironment: 'VERIFIED',
  backendSecretsSeparated: 'VERIFIED',
  backupConfirmed: 'VERIFIED',
  pitrConfirmed: 'VERIFIED',
  restoreTestPassed: 'VERIFIED',
  stagingSmokePassed: 'VERIFIED',
  globalKillSwitchTested: 'VERIFIED',
  clinicKillSwitchTested: 'VERIFIED',
  criticalEvaluationPassed: 'VERIFIED',
  stagingHealthPassed: 'VERIFIED',
  productionHealthPassed: 'VERIFIED',
  tenantPrivacyChecksPassed: 'VERIFIED',
};

describe('PlatformPilotReadinessService', () => {
  it('allows eligibility only when every required evidence item is verified', () => {
    expect(new PlatformPilotReadinessService().evaluate(verified)).toMatchObject({
      ready: true,
      eligibleForShadowPilot: true,
      blockers: [],
    });
  });

  it('keeps manual verification and blocked evidence as pilot blockers', () => {
    const result = new PlatformPilotReadinessService().evaluate({
      ...verified,
      restoreTestPassed: 'MANUAL_VERIFICATION_REQUIRED',
      stagingDatabaseSeparated: 'BLOCKED',
    });
    expect(result.ready).toBe(false);
    expect(result.eligibleForShadowPilot).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      { code: 'RESTORE_TEST_NOT_PASSED', status: 'MANUAL_VERIFICATION_REQUIRED' },
      { code: 'STAGING_DATABASE_NOT_VERIFIED', status: 'BLOCKED' },
    ]));
  });
});
