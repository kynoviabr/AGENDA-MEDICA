export type AppEnvironment = 'local' | 'staging' | 'production' | 'unknown';
export type OperationalEvidenceStatus = 'VERIFIED' | 'MANUAL_VERIFICATION_REQUIRED' | 'BLOCKED';
export type OperationalHealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type OperationalComponent = 'edge' | 'database' | 'openai' | 'whatsapp' | 'conversation' | 'tool' | 'knowledge' | 'safety' | 'handoff' | 'outbound';
export type OperationalEventType =
  | 'whatsapp_inbound_received' | 'whatsapp_inbound_rejected'
  | 'ai_processing_started' | 'ai_processing_completed' | 'ai_processing_failed'
  | 'llm_request' | 'llm_failure' | 'tool_execution' | 'tool_failure'
  | 'knowledge_lookup' | 'safety_validation'
  | 'handoff_requested' | 'handoff_accepted'
  | 'outbound_attempt' | 'outbound_success' | 'outbound_failure';

export type OperationalErrorCategory =
  | 'provider_timeout' | 'provider_rate_limit' | 'invalid_provider_response'
  | 'database_error' | 'rpc_conflict' | 'tool_denied' | 'knowledge_unavailable'
  | 'safety_fail_closed' | 'whatsapp_send_failure' | 'configuration_error' | 'unknown';

export interface OperationalTraceContext {
  clinicId: string;
  conversationId?: string;
  correlationId: string;
  channel: 'whatsapp' | 'web' | 'internal';
  component: OperationalComponent;
  startedAt: string;
}

export interface SanitizedOperationalError {
  code: string;
  component: OperationalComponent;
  category: OperationalErrorCategory;
  retryable: boolean;
  timestamp: string;
}

export interface OperationalEvent {
  type: OperationalEventType;
  context: OperationalTraceContext;
  outcome: 'success' | 'failure' | 'rejected';
  occurredAt: string;
  latencyMs?: number;
  error?: SanitizedOperationalError;
}

export interface HealthCheckResult {
  key: string;
  state: OperationalHealthState;
  required: boolean;
  code: string;
}

export interface HealthSummary {
  state: OperationalHealthState;
  checks: readonly HealthCheckResult[];
  checkedAt: string;
}

export interface LatencySummary { count: number; averageMs: number; p50Ms: number; p95Ms: number }

export interface OperationalMetrics {
  conversations: number;
  inboundMessages: number;
  aiResponses: number;
  aiFailures: number;
  toolCalls: number;
  toolFailures: number;
  mutationAttempts: number;
  mutationSuccesses: number;
  mutationFailures: number;
  knowledge: Record<'answered' | 'not_found' | 'ambiguous' | 'restricted', number>;
  safety: Record<'allow' | 'rewrite_safe' | 'block' | 'require_clarification' | 'require_handoff', number>;
  handoffs: number;
  humanTakeovers: number;
  outboundFailures: number;
  latency: LatencySummary;
}

export interface PlatformPilotEvidence {
  stagingDatabaseSeparated: OperationalEvidenceStatus;
  stagingApplicationSeparated: OperationalEvidenceStatus;
  stagingAppEnvironment: OperationalEvidenceStatus;
  productionAppEnvironment: OperationalEvidenceStatus;
  backendSecretsSeparated: OperationalEvidenceStatus;
  backupConfirmed: OperationalEvidenceStatus;
  pitrConfirmed: OperationalEvidenceStatus;
  restoreTestPassed: OperationalEvidenceStatus;
  stagingSmokePassed: OperationalEvidenceStatus;
  globalKillSwitchTested: OperationalEvidenceStatus;
  clinicKillSwitchTested: OperationalEvidenceStatus;
  criticalEvaluationPassed: OperationalEvidenceStatus;
  stagingHealthPassed: OperationalEvidenceStatus;
  productionHealthPassed: OperationalEvidenceStatus;
  tenantPrivacyChecksPassed: OperationalEvidenceStatus;
}

export interface PlatformReadinessIssue {
  code: string;
  status: Exclude<OperationalEvidenceStatus, 'VERIFIED'>;
}

export interface PlatformPilotReadiness {
  ready: boolean;
  eligibleForShadowPilot: boolean;
  blockers: readonly PlatformReadinessIssue[];
  warnings: readonly PlatformReadinessIssue[];
}

export interface StagingReadinessEvidence {
  remoteProjectClassifiedAsStaging: OperationalEvidenceStatus;
  stagingAppEnvironment: OperationalEvidenceStatus;
  stagingHealthPassed: OperationalEvidenceStatus;
  stagingSyntheticDataConfirmed: OperationalEvidenceStatus;
  stagingSmokePassed: OperationalEvidenceStatus;
  stagingKillSwitchTested: OperationalEvidenceStatus;
  criticalEvaluationPassed: OperationalEvidenceStatus;
  tenantPrivacyChecksPassed: OperationalEvidenceStatus;
}

export interface RealPilotReadinessEvidence {
  productionProvisioned: OperationalEvidenceStatus;
  productionAppEnvironment: OperationalEvidenceStatus;
  productionSecretsSeparated: OperationalEvidenceStatus;
  backupPolicyAccepted: OperationalEvidenceStatus;
  restoreTestPassed: OperationalEvidenceStatus;
  clinicOnboardingCompleted: OperationalEvidenceStatus;
  explicitRolloutApproval: OperationalEvidenceStatus;
}

export interface EnvironmentReadinessResult {
  developmentReadyForStaging: boolean;
  stagingReady: boolean;
  realPilotReady: boolean;
  stagingBlockers: readonly PlatformReadinessIssue[];
  realPilotBlockers: readonly PlatformReadinessIssue[];
}
