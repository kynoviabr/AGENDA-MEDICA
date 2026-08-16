import type {
  EnvironmentReadinessResult,
  PlatformReadinessIssue,
  RealPilotReadinessEvidence,
  StagingReadinessEvidence,
} from './domain.ts';

const STAGING_CODES: Record<keyof StagingReadinessEvidence, string> = {
  remoteProjectClassifiedAsStaging: 'STAGING_PROJECT_NOT_CLASSIFIED',
  stagingAppEnvironment: 'STAGING_APP_ENV_NOT_VERIFIED',
  stagingHealthPassed: 'STAGING_HEALTH_NOT_PASSED',
  stagingSyntheticDataConfirmed: 'STAGING_SYNTHETIC_DATA_NOT_CONFIRMED',
  stagingSmokePassed: 'STAGING_SMOKE_NOT_PASSED',
  stagingKillSwitchTested: 'STAGING_KILL_SWITCH_NOT_TESTED',
  criticalEvaluationPassed: 'CRITICAL_EVALUATION_NOT_PASSED',
  tenantPrivacyChecksPassed: 'TENANT_PRIVACY_CHECKS_NOT_PASSED',
};

const REAL_PILOT_CODES: Record<keyof RealPilotReadinessEvidence, string> = {
  productionProvisioned: 'PRODUCTION_NOT_PROVISIONED',
  productionAppEnvironment: 'PRODUCTION_APP_ENV_NOT_VERIFIED',
  productionSecretsSeparated: 'PRODUCTION_SECRETS_NOT_SEPARATED',
  backupPolicyAccepted: 'PRODUCTION_BACKUP_POLICY_NOT_ACCEPTED',
  restoreTestPassed: 'PRODUCTION_RESTORE_TEST_NOT_PASSED',
  clinicOnboardingCompleted: 'PILOT_CLINIC_ONBOARDING_NOT_COMPLETED',
  explicitRolloutApproval: 'ROLLOUT_NOT_APPROVED',
};

function issues<T extends Record<string, unknown>>(
  evidence: T,
  codes: Record<keyof T, string>,
): PlatformReadinessIssue[] {
  return (Object.keys(codes) as Array<keyof T>).flatMap((key) => {
    const status = evidence[key];
    return status === 'VERIFIED' ? [] : [{ code: codes[key], status: status as 'BLOCKED' | 'MANUAL_VERIFICATION_REQUIRED' }];
  });
}

export class AuraEnvironmentReadinessService {
  evaluate(staging: StagingReadinessEvidence, realPilot: RealPilotReadinessEvidence): EnvironmentReadinessResult {
    const stagingBlockers = issues(staging, STAGING_CODES);
    const realPilotBlockers = issues(realPilot, REAL_PILOT_CODES);
    return {
      developmentReadyForStaging:
        staging.remoteProjectClassifiedAsStaging === 'VERIFIED'
        && staging.stagingAppEnvironment === 'VERIFIED'
        && staging.stagingHealthPassed === 'VERIFIED'
        && staging.criticalEvaluationPassed === 'VERIFIED'
        && staging.tenantPrivacyChecksPassed === 'VERIFIED',
      stagingReady: stagingBlockers.length === 0,
      realPilotReady: realPilotBlockers.length === 0,
      stagingBlockers,
      realPilotBlockers,
    };
  }
}
