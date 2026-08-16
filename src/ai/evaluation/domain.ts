import type { AiConversationIntent } from '../domain/conversation.ts';
import type { AiMessageType } from '../domain/models.ts';
import type { AiResponseSafetyDisposition, AiSafetyViolationCategory } from '../safety/domain.ts';
import type { AiToolName, AiToolResult } from '../tools/domain.ts';

export const AI_EVALUATION_DATASET_VERSION = 1 as const;

export type AiEvaluationCategory =
  | 'conversation' | 'intent' | 'context' | 'temporal' | 'ambiguity' | 'references'
  | 'correction' | 'negation' | 'tool_selection' | 'tool_arguments' | 'scheduling'
  | 'mutation' | 'knowledge' | 'grounding' | 'hallucination' | 'safety' | 'medical'
  | 'prompt_injection' | 'privacy' | 'tenant' | 'multimodal' | 'error_handling'
  | 'naturalness' | 'latency';

export type AiEvaluationSeverity = 'critical' | 'high' | 'medium' | 'low';

export type AiEvaluationMetricName =
  | 'intent_accuracy' | 'entity_accuracy' | 'temporal_accuracy' | 'context_retention_rate'
  | 'ambiguity_handling_rate' | 'clarification_correctness' | 'tool_selection_accuracy'
  | 'tool_argument_accuracy' | 'mutation_confirmation_compliance' | 'groundedness_rate'
  | 'hallucination_rate' | 'numeric_accuracy' | 'safety_pass_rate' | 'privacy_pass_rate'
  | 'tenant_isolation_pass_rate' | 'response_quality_rate';

export type AiEvaluationAssertionType =
  | 'equals' | 'contains' | 'not_contains' | 'exists' | 'not_exists'
  | 'tool_called' | 'tool_not_called' | 'exact_tool_count' | 'mutation_count'
  | 'safety_disposition' | 'violation_present' | 'grounding_source_present'
  | 'no_cross_tenant' | 'response_matches_fact' | 'response_does_not_invent'
  | 'asks_question' | 'max_latency';

export interface AiEvaluationAssertion {
  type: AiEvaluationAssertionType;
  path?: string;
  expected?: unknown;
  value?: string;
  toolName?: AiToolName;
  metric?: AiEvaluationMetricName;
  description?: string;
  critical?: boolean;
}

export interface AiEvaluationSyntheticEntity { id: string; name: string; clinicId?: string }

export interface AiEvaluationSetup {
  clinic: AiEvaluationSyntheticEntity & { timezone: string };
  locations?: readonly AiEvaluationSyntheticEntity[];
  professionals?: readonly AiEvaluationSyntheticEntity[];
  services?: readonly AiEvaluationSyntheticEntity[];
  insurances?: readonly AiEvaluationSyntheticEntity[];
  patient?: AiEvaluationSyntheticEntity;
  appointments?: readonly (AiEvaluationSyntheticEntity & { startAt?: string })[];
  slots?: readonly string[];
  knowledge?: readonly { id: string; fact: string; clinicId: string; published: boolean; verified: boolean; patientVisible: boolean }[];
  featureFlags?: Readonly<Record<string, boolean | string>>;
  fixedNow: string;
  timezone: string;
}

export interface AiEvaluationProviderOutput {
  intent: AiConversationIntent;
  entities?: Readonly<Record<string, unknown>>;
  clearEntities?: readonly string[];
  ambiguity?: readonly string[];
  responseDraft: string;
  safetyDisposition?: AiResponseSafetyDisposition;
  violations?: readonly AiSafetyViolationCategory[];
  groundingSources?: readonly string[];
  factualClaims?: readonly string[];
  supportedClaims?: readonly string[];
  requiresClarification?: boolean;
  requiresHandoff?: boolean;
  confirmed?: boolean;
  toolResult?: AiToolResult;
  latency?: Partial<AiEvaluationLatency>;
  errorCode?: string;
  tenantLeak?: boolean;
}

export interface AiEvaluationTurn {
  id: string;
  input: string;
  modality?: AiMessageType;
  messageId?: string;
  providerOutput: AiEvaluationProviderOutput;
  assertions: readonly AiEvaluationAssertion[];
}

export interface AiEvaluationScenario {
  id: string;
  version: number;
  category: AiEvaluationCategory;
  description: string;
  setup: AiEvaluationSetup;
  turns: readonly AiEvaluationTurn[];
  expected?: readonly AiEvaluationAssertion[];
  tags: readonly string[];
  severity: AiEvaluationSeverity;
}

export interface AiEvaluationLatency {
  preprocessingMs: number;
  conversationMs: number;
  toolsMs: number;
  knowledgeMs: number;
  safetyMs: number;
  totalMs: number;
}

export interface AiEvaluationTurnCapture {
  intent: AiConversationIntent;
  entities: Readonly<Record<string, unknown>>;
  toolCalls: readonly { name: AiToolName; arguments: Readonly<Record<string, unknown>>; outcome?: AiToolResult['outcome'] }[];
  mutationCount: number;
  safetyDisposition: AiResponseSafetyDisposition;
  violations: readonly AiSafetyViolationCategory[];
  groundingSources: readonly string[];
  factualClaims: readonly string[];
  supportedClaims: readonly string[];
  response: string;
  requiresClarification: boolean;
  requiresHandoff: boolean;
  tenantLeak: boolean;
  errorCode?: string;
  latency: AiEvaluationLatency;
}

export interface AiEvaluationAssertionResult {
  assertion: AiEvaluationAssertion;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  message: string;
}

export interface AiEvaluationScenarioResult {
  scenarioId: string;
  passed: boolean;
  severity: AiEvaluationSeverity;
  assertionResults: readonly AiEvaluationAssertionResult[];
  turnCaptures: readonly AiEvaluationTurnCapture[];
  metrics: Readonly<Partial<Record<AiEvaluationMetricName, number>>>;
  latency: AiEvaluationLatency;
  errors: readonly string[];
}

export interface AiEvaluationMetricSummary {
  value: number;
  numerator: number;
  denominator: number;
}

export interface AiEvaluationRegression {
  metric: string;
  baseline: number;
  current: number;
  tolerance: number;
  critical: boolean;
}

export interface AiEvaluationSuiteResult {
  datasetVersion: number;
  suite: 'fast' | 'full' | 'model';
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  criticalFailures: readonly string[];
  metrics: Readonly<Record<AiEvaluationMetricName, AiEvaluationMetricSummary>>;
  latency: { averageMs: number; p50Ms: number; p95Ms: number };
  regressions: readonly AiEvaluationRegression[];
  gateFailures: readonly string[];
  durationMs: number;
  scenarios: readonly AiEvaluationScenarioResult[];
  passedQualityGates: boolean;
}

export interface AiEvaluationSubject {
  setup(scenario: AiEvaluationScenario): Promise<void>;
  executeTurn(scenario: AiEvaluationScenario, turn: AiEvaluationTurn, turnIndex: number): Promise<AiEvaluationTurnCapture>;
  teardown(scenario: AiEvaluationScenario): Promise<void>;
}

export interface AiEvaluationModelMetadata {
  provider: string;
  model: string;
  configProfile: string;
  inputTokens?: number;
  outputTokens?: number;
  requests?: number;
}
