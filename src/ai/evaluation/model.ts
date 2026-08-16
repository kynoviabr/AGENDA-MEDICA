import type { AiEvaluationScenario, AiEvaluationSubject, AiEvaluationTurn, AiEvaluationTurnCapture } from './domain.ts';

/** Optional adapter boundary. It is never selected by the deterministic suite. */
export class GatedRealModelEvaluationSubject implements AiEvaluationSubject {
  constructor(
    private readonly enabled: boolean,
    private readonly delegate?: AiEvaluationSubject,
  ) {}
  async setup(scenario: AiEvaluationScenario) {
    if (!this.enabled || !this.delegate) throw new Error('real_model_eval_skipped');
    await this.delegate.setup(scenario);
  }
  async executeTurn(scenario: AiEvaluationScenario, turn: AiEvaluationTurn, index: number): Promise<AiEvaluationTurnCapture> {
    if (!this.enabled || !this.delegate) throw new Error('real_model_eval_skipped');
    return this.delegate.executeTurn(scenario, turn, index);
  }
  async teardown(scenario: AiEvaluationScenario) { await this.delegate?.teardown(scenario); }
}
