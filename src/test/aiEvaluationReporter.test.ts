import { describe, expect, it } from 'vitest';
import { formatAiEvaluationConsoleReport, serializeAiEvaluationJsonReport } from '@/ai/evaluation/reporters.ts';
import { AiEvaluationRunner } from '@/ai/evaluation/runner.ts';
import { AI_EVALUATION_FAST_V1 } from '@/ai/evaluation/datasets/v1/index.ts';
import { DeterministicAuraEvaluationSubject } from '@/ai/evaluation/testing/DeterministicAuraEvaluationSubject.ts';

describe('AI evaluation reporters', () => {
  it('renders console and content-free JSON reports', async () => {
    const result = await new AiEvaluationRunner(new DeterministicAuraEvaluationSubject())
      .run(AI_EVALUATION_FAST_V1, { suite: 'fast' });
    expect(formatAiEvaluationConsoleReport(result)).toContain('AI Evaluation — fast');
    const json = serializeAiEvaluationJsonReport(result);
    expect(JSON.parse(json).total).toBe(AI_EVALUATION_FAST_V1.length);
    expect(json).not.toContain('Paciente Exemplo');
    expect(json).not.toContain('mensagem sintética');
  });
});
