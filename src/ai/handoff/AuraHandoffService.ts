import type { AiExecutionContext } from '../domain/models.ts';
import {
  AI_HANDOFF_FAILURE_THRESHOLD, AiConversationSuspendedError,
  type AiHandoffFeatureConfig, type AiHandoffReason, type AiHandoffRecord,
  type AiHandoffRepository, type AiHandoffSignal,
} from './domain.ts';
import { isAutomaticHandoffAllowed } from './policies.ts';
import { buildDeterministicHandoffSummary } from './summary.ts';

export class AuraHandoffService {
  constructor(
    private readonly repository: AiHandoffRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly failureThreshold = AI_HANDOFF_FAILURE_THRESHOLD,
  ) {}

  async assertAiActive(context: AiExecutionContext) {
    const control = await this.repository.loadControl(context);
    if (control.clinicId !== context.clinicId || control.conversationId !== context.conversationId) {
      throw new Error('Handoff control crossed the tenant boundary.');
    }
    if (control.mode !== 'ai_active') throw new AiConversationSuspendedError(control.mode);
    return control;
  }

  async requestAutomatic(
    context: AiExecutionContext,
    config: AiHandoffFeatureConfig,
    signal: AiHandoffSignal,
  ): Promise<AiHandoffRecord | null> {
    if (!isAutomaticHandoffAllowed(config)) return null;
    return this.repository.request({
      context, reason: signal.reason, priority: signal.priority, source: signal.source,
      requestedAt: this.now().toISOString(),
      summary: buildDeterministicHandoffSummary({
        reason: signal.reason, conversation: signal.conversation, state: signal.state, toolResult: signal.toolResult,
      }),
    });
  }

  async recordOperationalFailure(
    context: AiExecutionContext,
    config: AiHandoffFeatureConfig,
    reason: Extract<AiHandoffReason, 'repeated_failure' | 'repeated_ambiguity' | 'knowledge_not_found' | 'provider_unavailable' | 'mutation_failure'>,
  ) {
    if (!isAutomaticHandoffAllowed(config)) return null;
    return this.repository.recordOperationalFailure(context, reason, this.failureThreshold);
  }

  async recordSuccess(context: AiExecutionContext) {
    await this.repository.resetOperationalFailures(context);
  }
}
