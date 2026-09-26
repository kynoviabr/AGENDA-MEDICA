import type {
  PlatformPilotEvidence,
  PlatformPilotReadiness,
  PlatformReadinessIssue,
} from './domain.ts';

const REQUIRED_EVIDENCE_CODES: Record<keyof PlatformPilotEvidence, string> = {
  stagingDatabaseSeparated: 'STAGING_DATABASE_NOT_VERIFIED',
  stagingApplicationSeparated: 'STAGING_APPLICATION_NOT_VERIFIED',
  stagingAppEnvironment: 'STAGING_APP_ENV_NOT_VERIFIED',
  productionAppEnvironment: 'PRODUCTION_APP_ENV_NOT_VERIFIED',
  backendSecretsSeparated: 'BACKEND_SECRETS_SEPARATION_NOT_VERIFIED',
  backupConfirmed: 'BACKUP_NOT_VERIFIED',
  pitrConfirmed: 'PITR_NOT_VERIFIED',
  restoreTestPassed: 'RESTORE_TEST_NOT_PASSED',
  stagingSmokePassed: 'STAGING_SMOKE_NOT_PASSED',
  globalKillSwitchTested: 'GLOBAL_KILL_SWITCH_NOT_TESTED',
  clinicKillSwitchTested: 'CLINIC_KILL_SWITCH_NOT_TESTED',
  criticalEvaluationPassed: 'CRITICAL_EVALUATION_NOT_PASSED',
  stagingHealthPassed: 'STAGING_HEALTH_NOT_PASSED',
  productionHealthPassed: 'PRODUCTION_HEALTH_NOT_PASSED',
  tenantPrivacyChecksPassed: 'TENANT_PRIVACY_CHECKS_NOT_PASSED',
};

export class PlatformPilotReadinessService {
  evaluate(evidence: PlatformPilotEvidence): PlatformPilotReadiness {
    const blockers: PlatformReadinessIssue[] = [];

    for (const [key, code] of Object.entries(REQUIRED_EVIDENCE_CODES) as Array<[
      keyof PlatformPilotEvidence,
      string,
    ]>) {
      const status = evidence[key];
      if (status !== 'VERIFIED') blockers.push({ code, status });
    }

    const ready = blockers.length === 0;
    return {
      ready,
      eligibleForShadowPilot: ready,
      blockers,
      warnings: [],
    };
  }
}
