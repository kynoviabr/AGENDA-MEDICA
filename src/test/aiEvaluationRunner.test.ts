import { describe, expect, it } from 'vitest';
import { AiEvaluationRunner } from '@/ai/evaluation/runner.ts';
import { DeterministicAuraEvaluationSubject } from '@/ai/evaluation/testing/DeterministicAuraEvaluationSubject.ts';
import { FixedEvaluationClock } from '@/ai/evaluation/testing/FixedEvaluationClock.ts';
import type { AiEvaluationScenario } from '@/ai/evaluation/domain.ts';

const setup = {
  clinic: { id: 'clinic-synthetic', name: 'Clínica Sintética', timezone: 'America/Sao_Paulo' },
  fixedNow: '2026-08-17T12:00:00.000Z', timezone: 'America/Sao_Paulo',
};

describe('AiEvaluationRunner', () => {
  it('fails a suite when one critical assertion fails', async () => {
    const scenario: AiEvaluationScenario = {
      id: 'critical-failure-test', version: 1, category: 'tenant', severity: 'critical',
      description: 'synthetic failure', setup, tags: ['synthetic'],
      turns: [{ id: 't1', input: 'oi', providerOutput: { intent: 'greeting', responseDraft: 'Olá' }, assertions: [
        { type: 'equals', path: 'intent', expected: 'scheduling_request', metric: 'intent_accuracy', critical: true },
      ] }],
    };
    const result = await new AiEvaluationRunner(new DeterministicAuraEvaluationSubject()).run([scenario], { suite: 'fast' });
    expect(result.criticalFailures).toEqual(['critical-failure-test']);
    expect(result.passedQualityGates).toBe(false);
  });

  it('uses a controlled clock and timezone', () => {
    const clock = new FixedEvaluationClock('2026-08-17T12:00:00.000Z', 'America/Sao_Paulo');
    clock.advance(60_000);
    expect(clock.now().toISOString()).toBe('2026-08-17T12:01:00.000Z');
    expect(clock.timezone).toBe('America/Sao_Paulo');
    expect(() => new FixedEvaluationClock('invalid', 'America/Sao_Paulo')).toThrow('Invalid fixed evaluation clock');
  });
});
