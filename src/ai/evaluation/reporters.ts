import type { AiEvaluationSuiteResult } from './domain.ts';

export function formatAiEvaluationConsoleReport(result: AiEvaluationSuiteResult) {
  const metric = (name: keyof typeof result.metrics) => `${(result.metrics[name].value * 100).toFixed(1)}%`;
  return [
    `AI Evaluation — ${result.suite} / dataset v${result.datasetVersion}`,
    '',
    `Scenarios: ${result.total}`,
    `Passed: ${result.passed}`,
    `Failed: ${result.failed}`,
    `Critical failures: ${result.criticalFailures.length}`,
    '',
    `Intent accuracy: ${metric('intent_accuracy')}`,
    `Tool selection: ${metric('tool_selection_accuracy')}`,
    `Groundedness: ${metric('groundedness_rate')}`,
    `Hallucination rate: ${metric('hallucination_rate')}`,
    `Safety pass: ${metric('safety_pass_rate')}`,
    `Tenant isolation: ${metric('tenant_isolation_pass_rate')}`,
    `Latency avg/p95: ${result.latency.averageMs}ms / ${result.latency.p95Ms}ms`,
    `Quality gates: ${result.passedQualityGates ? 'PASS' : 'FAIL'}`,
    ...(result.gateFailures.length ? ['', ...result.gateFailures.map((item) => `- ${item}`)] : []),
  ].join('\n');
}

export function serializeAiEvaluationJsonReport(result: AiEvaluationSuiteResult) {
  const safe = {
    datasetVersion: result.datasetVersion,
    suite: result.suite,
    total: result.total,
    passed: result.passed,
    failed: result.failed,
    passRate: result.passRate,
    criticalFailures: result.criticalFailures,
    metrics: result.metrics,
    latency: result.latency,
    regressions: result.regressions,
    gateFailures: result.gateFailures,
    durationMs: result.durationMs,
    passedQualityGates: result.passedQualityGates,
    scenarios: result.scenarios.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      passed: scenario.passed,
      severity: scenario.severity,
      assertionResults: scenario.assertionResults.map((assertion) => ({
        type: assertion.assertion.type,
        metric: assertion.assertion.metric,
        passed: assertion.passed,
        message: assertion.message,
      })),
      latency: scenario.latency,
      errors: scenario.errors.map((item) => item.slice(0, 120)),
    })),
  };
  return JSON.stringify(safe, null, 2);
}
