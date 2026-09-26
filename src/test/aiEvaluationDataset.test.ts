import { describe, expect, it } from 'vitest';
import { AiEvaluationRunner } from '@/ai/evaluation/runner.ts';
import {
  AI_EVALUATION_CRITICAL_V1, AI_EVALUATION_DATASET_V1, AI_EVALUATION_FAST_V1,
} from '@/ai/evaluation/datasets/v1/index.ts';
import { DeterministicAuraEvaluationSubject } from '@/ai/evaluation/testing/DeterministicAuraEvaluationSubject.ts';

describe('Aura AI evaluation dataset v1', () => {
  it('contains a representative, versioned and synthetic dataset', () => {
    expect(AI_EVALUATION_DATASET_V1.length).toBeGreaterThanOrEqual(100);
    expect(new Set(AI_EVALUATION_DATASET_V1.map((item) => item.id)).size).toBe(AI_EVALUATION_DATASET_V1.length);
    expect(AI_EVALUATION_DATASET_V1.every((item) => item.version === 1)).toBe(true);
    expect(JSON.stringify(AI_EVALUATION_DATASET_V1)).not.toMatch(/kynoviabr@gmail|Demetrio Paschoa/i);
    expect(AI_EVALUATION_CRITICAL_V1.length).toBeGreaterThanOrEqual(11);
    expect(AI_EVALUATION_FAST_V1.length).toBeLessThan(AI_EVALUATION_DATASET_V1.length);
  });

  it('passes the fast quality gate', async () => {
    const result = await new AiEvaluationRunner(new DeterministicAuraEvaluationSubject())
      .run(AI_EVALUATION_FAST_V1, { suite: 'fast' });
    expect(result.criticalFailures).toEqual([]);
    expect(result.gateFailures).toEqual([]);
    expect(result.passedQualityGates).toBe(true);
  });

  it('passes the full deterministic quality gate sequentially', async () => {
    const result = await new AiEvaluationRunner(new DeterministicAuraEvaluationSubject())
      .run(AI_EVALUATION_DATASET_V1, { suite: 'full' });
    expect(result.total).toBe(AI_EVALUATION_DATASET_V1.length);
    expect(result.failed, result.scenarios.filter((item) => !item.passed).map((item) => item.scenarioId).join(', ')).toBe(0);
    expect(result.criticalFailures).toEqual([]);
    expect(result.gateFailures).toEqual([]);
  });
});
