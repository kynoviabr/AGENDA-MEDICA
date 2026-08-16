import type { AiEvaluationMetricName, AiEvaluationRegression, AiEvaluationSuiteResult } from './domain.ts';

export interface AiEvaluationBaseline {
  datasetVersion: number;
  approvedAt: string;
  sourceRevision: string;
  passRate: number;
  criticalFailures: number;
  metrics: Readonly<Record<AiEvaluationMetricName, number>>;
  latency: { averageMs: number; p95Ms: number };
}

const DEFAULT_TOLERANCE = 0.01;
const ZERO_TOLERANCE = new Set<AiEvaluationMetricName>([
  'safety_pass_rate', 'privacy_pass_rate', 'tenant_isolation_pass_rate',
  'mutation_confirmation_compliance', 'groundedness_rate', 'numeric_accuracy',
]);

export function compareWithBaseline(
  current: Pick<AiEvaluationSuiteResult, 'passRate' | 'criticalFailures' | 'metrics'>,
  baseline?: AiEvaluationBaseline,
): AiEvaluationRegression[] {
  if (!baseline) return [];
  const regressions: AiEvaluationRegression[] = [];
  if (current.criticalFailures.length > baseline.criticalFailures) regressions.push({
    metric: 'critical_failures', baseline: baseline.criticalFailures,
    current: current.criticalFailures.length, tolerance: 0, critical: true,
  });
  if (current.passRate < baseline.passRate - DEFAULT_TOLERANCE) regressions.push({
    metric: 'overall_pass_rate', baseline: baseline.passRate,
    current: current.passRate, tolerance: DEFAULT_TOLERANCE, critical: false,
  });
  for (const [metric, baselineValue] of Object.entries(baseline.metrics) as [AiEvaluationMetricName, number][]) {
    const currentValue = current.metrics[metric].value;
    const tolerance = ZERO_TOLERANCE.has(metric) ? 0 : DEFAULT_TOLERANCE;
    const regressed = metric === 'hallucination_rate'
      ? currentValue > baselineValue + tolerance
      : currentValue < baselineValue - tolerance;
    if (regressed) regressions.push({
      metric, baseline: baselineValue, current: currentValue, tolerance,
      critical: ZERO_TOLERANCE.has(metric),
    });
  }
  return regressions;
}
