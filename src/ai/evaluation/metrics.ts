import type {
  AiEvaluationAssertionResult,
  AiEvaluationLatency,
  AiEvaluationMetricName,
  AiEvaluationMetricSummary,
  AiEvaluationScenarioResult,
} from './domain.ts';

export const AI_EVALUATION_METRICS: readonly AiEvaluationMetricName[] = [
  'intent_accuracy', 'entity_accuracy', 'temporal_accuracy', 'context_retention_rate',
  'ambiguity_handling_rate', 'clarification_correctness', 'tool_selection_accuracy',
  'tool_argument_accuracy', 'mutation_confirmation_compliance', 'groundedness_rate',
  'hallucination_rate', 'numeric_accuracy', 'safety_pass_rate', 'privacy_pass_rate',
  'tenant_isolation_pass_rate', 'response_quality_rate',
];

export function aggregateMetrics(results: readonly AiEvaluationScenarioResult[]) {
  const summaries = Object.fromEntries(AI_EVALUATION_METRICS.map((metric) => {
    const assertions = results.flatMap((result) => result.assertionResults)
      .filter((item) => item.assertion.metric === metric);
    const passed = assertions.filter((item) => item.passed).length;
    const value = metric === 'hallucination_rate'
      ? rate(assertions.length - passed, assertions.length)
      : rate(passed, assertions.length);
    return [metric, { value, numerator: metric === 'hallucination_rate' ? assertions.length - passed : passed, denominator: assertions.length }];
  })) as Record<AiEvaluationMetricName, AiEvaluationMetricSummary>;
  return summaries;
}

export function scenarioMetrics(assertions: readonly AiEvaluationAssertionResult[]) {
  const output: Partial<Record<AiEvaluationMetricName, number>> = {};
  for (const metric of AI_EVALUATION_METRICS) {
    const matching = assertions.filter((item) => item.assertion.metric === metric);
    if (!matching.length) continue;
    const passed = matching.filter((item) => item.passed).length;
    output[metric] = metric === 'hallucination_rate'
      ? rate(matching.length - passed, matching.length)
      : rate(passed, matching.length);
  }
  return output;
}

export function aggregateLatency(latencies: readonly AiEvaluationLatency[]) {
  const values = latencies.map((item) => item.totalMs).sort((a, b) => a - b);
  return {
    averageMs: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0,
    p50Ms: percentile(values, 50),
    p95Ms: percentile(values, 95),
  };
}

export function sumLatency(items: readonly AiEvaluationLatency[]): AiEvaluationLatency {
  return items.reduce((sum, item) => ({
    preprocessingMs: sum.preprocessingMs + item.preprocessingMs,
    conversationMs: sum.conversationMs + item.conversationMs,
    toolsMs: sum.toolsMs + item.toolsMs,
    knowledgeMs: sum.knowledgeMs + item.knowledgeMs,
    safetyMs: sum.safetyMs + item.safetyMs,
    totalMs: sum.totalMs + item.totalMs,
  }), { preprocessingMs: 0, conversationMs: 0, toolsMs: 0, knowledgeMs: 0, safetyMs: 0, totalMs: 0 });
}

export function percentile(sortedValues: readonly number[], percentage: number) {
  if (!sortedValues.length) return 0;
  const index = Math.max(0, Math.ceil((percentage / 100) * sortedValues.length) - 1);
  return sortedValues[Math.min(index, sortedValues.length - 1)];
}

function rate(numerator: number, denominator: number) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 1;
}
