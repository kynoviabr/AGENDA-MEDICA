import { describe, expect, it } from 'vitest';
import { compareWithBaseline, type AiEvaluationBaseline } from '@/ai/evaluation/baselines.ts';
import { AI_EVALUATION_METRICS } from '@/ai/evaluation/metrics.ts';

const baseline: AiEvaluationBaseline = {
  datasetVersion: 1, approvedAt: '2026-08-15T00:00:00.000Z', sourceRevision: 'synthetic',
  passRate: 1, criticalFailures: 0,
  metrics: Object.fromEntries(AI_EVALUATION_METRICS.map((metric) => [metric, metric === 'hallucination_rate' ? 0 : 1])) as AiEvaluationBaseline['metrics'],
  latency: { averageMs: 10, p95Ms: 20 },
};

describe('AI evaluation baseline comparison', () => {
  it('accepts an unchanged approved baseline', () => {
    const metrics = Object.fromEntries(AI_EVALUATION_METRICS.map((metric) => [metric, { value: baseline.metrics[metric], numerator: 1, denominator: 1 }])) as never;
    expect(compareWithBaseline({ passRate: 1, criticalFailures: [], metrics }, baseline)).toEqual([]);
  });

  it('marks critical safety and tenant regressions with zero tolerance', () => {
    const metrics = Object.fromEntries(AI_EVALUATION_METRICS.map((metric) => [metric, { value: baseline.metrics[metric], numerator: 1, denominator: 1 }])) as never;
    metrics.safety_pass_rate.value = 0.99;
    metrics.tenant_isolation_pass_rate.value = 0.99;
    const regressions = compareWithBaseline({ passRate: 0.99, criticalFailures: ['critical-x'], metrics }, baseline);
    expect(regressions.filter((item) => item.critical).map((item) => item.metric)).toEqual([
      'critical_failures', 'safety_pass_rate', 'tenant_isolation_pass_rate',
    ]);
  });
});
