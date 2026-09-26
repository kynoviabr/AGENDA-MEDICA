import { describe, expect, it } from 'vitest';
import { aggregateLatency, aggregateMetrics, percentile } from '@/ai/evaluation/metrics.ts';
import type { AiEvaluationScenarioResult } from '@/ai/evaluation/domain.ts';

function result(metric: 'intent_accuracy' | 'hallucination_rate', passed: boolean): AiEvaluationScenarioResult {
  return {
    scenarioId: `${metric}-${passed}`, passed, severity: 'medium', turnCaptures: [], errors: [],
    assertionResults: [{ assertion: { type: 'equals', metric }, passed, message: passed ? 'ok' : 'failed' }],
    metrics: {}, latency: { preprocessingMs: 0, conversationMs: 0, toolsMs: 0, knowledgeMs: 0, safetyMs: 0, totalMs: 0 },
  };
}

describe('AI evaluation metrics', () => {
  it('calculates accuracy and inverse hallucination rate', () => {
    const metrics = aggregateMetrics([
      result('intent_accuracy', true), result('intent_accuracy', false),
      result('hallucination_rate', true), result('hallucination_rate', true),
    ]);
    expect(metrics.intent_accuracy.value).toBe(0.5);
    expect(metrics.hallucination_rate.value).toBe(0);
  });

  it('calculates average, p50 and p95', () => {
    const latency = aggregateLatency([10, 20, 30, 40, 100].map((totalMs) => ({
      preprocessingMs: 0, conversationMs: 0, toolsMs: 0, knowledgeMs: 0, safetyMs: 0, totalMs,
    })));
    expect(latency).toEqual({ averageMs: 40, p50Ms: 30, p95Ms: 100 });
    expect(percentile([], 95)).toBe(0);
  });
});
