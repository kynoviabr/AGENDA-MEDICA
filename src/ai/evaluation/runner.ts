import { evaluateAssertion } from './assertions.ts';
import { compareWithBaseline, type AiEvaluationBaseline } from './baselines.ts';
import type {
  AiEvaluationScenario, AiEvaluationScenarioResult, AiEvaluationSubject, AiEvaluationSuiteResult,
} from './domain.ts';
import { AI_EVALUATION_DATASET_VERSION } from './domain.ts';
import { aggregateLatency, aggregateMetrics, scenarioMetrics, sumLatency } from './metrics.ts';
import { evaluateQualityGates } from './scoring.ts';

export interface AiEvaluationRunOptions {
  suite: 'fast' | 'full' | 'model';
  baseline?: AiEvaluationBaseline;
}

export class AiEvaluationRunner {
  constructor(private readonly subject: AiEvaluationSubject) {}

  async run(scenarios: readonly AiEvaluationScenario[], options: AiEvaluationRunOptions): Promise<AiEvaluationSuiteResult> {
    const startedAt = performance.now();
    const scenarioResults: AiEvaluationScenarioResult[] = [];
    for (const scenario of scenarios) scenarioResults.push(await this.runScenario(scenario));
    const passed = scenarioResults.filter((item) => item.passed).length;
    const metrics = aggregateMetrics(scenarioResults);
    const criticalFailures = scenarioResults
      .filter((item) => item.severity === 'critical' && !item.passed)
      .map((item) => item.scenarioId);
    const partial = {
      passRate: scenarios.length ? Number((passed / scenarios.length).toFixed(4)) : 1,
      criticalFailures,
      metrics,
    };
    const gateFailures = evaluateQualityGates(partial);
    const regressions = compareWithBaseline(partial, options.baseline);
    if (regressions.some((item) => item.critical)) gateFailures.push('critical baseline regression detected');
    return {
      datasetVersion: AI_EVALUATION_DATASET_VERSION,
      suite: options.suite,
      total: scenarios.length,
      passed,
      failed: scenarios.length - passed,
      ...partial,
      latency: aggregateLatency(scenarioResults.map((item) => item.latency)),
      regressions,
      gateFailures,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      scenarios: scenarioResults,
      passedQualityGates: gateFailures.length === 0,
    };
  }

  private async runScenario(scenario: AiEvaluationScenario): Promise<AiEvaluationScenarioResult> {
    const captures = [];
    const assertionResults = [];
    const errors: string[] = [];
    await this.subject.setup(scenario);
    try {
      for (let index = 0; index < scenario.turns.length; index += 1) {
        const turn = scenario.turns[index];
        try {
          const capture = await this.subject.executeTurn(scenario, turn, index);
          captures.push(capture);
          assertionResults.push(...turn.assertions.map((assertion) => evaluateAssertion(assertion, capture)));
        } catch (error) {
          errors.push(error instanceof Error ? error.message.slice(0, 160) : 'evaluation_turn_failed');
        }
      }
      const last = captures.at(-1);
      if (last && scenario.expected) assertionResults.push(...scenario.expected.map((assertion) => evaluateAssertion(assertion, last)));
    } finally {
      await this.subject.teardown(scenario);
    }
    return {
      scenarioId: scenario.id,
      passed: errors.length === 0 && assertionResults.every((item) => item.passed),
      severity: scenario.severity,
      assertionResults,
      turnCaptures: captures,
      metrics: scenarioMetrics(assertionResults),
      latency: sumLatency(captures.map((item) => item.latency)),
      errors,
    };
  }
}
