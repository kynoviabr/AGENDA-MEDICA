import type {
  AiClinicConfig,
  AiConversationMessage,
  AiExecutionContext,
  AiNormalizedMessage,
  AiResponse,
} from '../domain/models.ts';
import { AiValidationError } from '../errors/AiError.ts';
import type { AiUsageRecorder } from '../usage/AiUsageRecorder.ts';
import { NoopAiUsageRecorder } from '../usage/AiUsageRecorder.ts';
import type { AuraConversationEngine } from './AuraConversationEngine.ts';

export interface AiClinicConfigLoader {
  load(context: AiExecutionContext): Promise<AiClinicConfig>;
}

export interface AiConversationHistoryLoader {
  loadRecent(context: AiExecutionContext, limit: number): Promise<readonly AiConversationMessage[]>;
}

export interface AuraAiOrchestratorOptions { now?: () => Date }

export class AuraAiOrchestrator {
  private readonly now: () => Date;

  constructor(
    private readonly conversationEngine: AuraConversationEngine,
    private readonly clinicConfigLoader: AiClinicConfigLoader,
    private readonly usageRecorder: AiUsageRecorder = new NoopAiUsageRecorder(),
    options: AuraAiOrchestratorOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async respond(context: AiExecutionContext, message: AiNormalizedMessage): Promise<AiResponse> {
    this.validateContext(context, message);
    await this.recordPreprocessing(context, message);
    const config = await this.clinicConfigLoader.load(context);
    if (config.clinicId !== context.clinicId) throw new AiValidationError('Clinic configuration crossed the tenant boundary.');
    if (!config.enabled) throw new AiValidationError('Aura AI is disabled for this clinic.');
    const conversation = await this.conversationEngine.process(context, message, config, this.buildClinicContext(config));
    return {
      text: conversation.responseText,
      provider: conversation.provider,
      model: conversation.model,
      usage: conversation.usage,
      latencyMs: conversation.latencyMs,
      safetyDisposition: conversation.safetyDisposition,
      requiresClarification: Boolean(conversation.clarification),
      requiresHandoff: conversation.requiresHandoff,
      conversationIntent: conversation.intent,
      readyForToolExecution: conversation.readyForToolExecution,
    };
  }

  private validateContext(context: AiExecutionContext, message: AiNormalizedMessage) {
    if (!context.clinicId || !context.conversationId || !context.correlationId) {
      throw new AiValidationError('AI execution context is incomplete.');
    }
    if (message.clinicId !== context.clinicId || message.conversationId !== context.conversationId) {
      throw new AiValidationError('Normalized message crossed the tenant boundary.');
    }
  }

  private buildClinicContext(config: AiClinicConfig): string {
    const facts = config.administrativeContext?.filter(Boolean) || [];
    return [
      `Clínica: ${config.clinicName}.`,
      `Timezone: ${config.timezone || 'America/Sao_Paulo'}.`,
      facts.length ? `Fatos administrativos autorizados:\n- ${facts.join('\n- ')}` : 'Nenhum fato administrativo específico foi fornecido.',
    ].join('\n');
  }

  private async recordPreprocessing(context: AiExecutionContext, message: AiNormalizedMessage) {
    for (const metric of message.processingMetrics) {
      await this.usageRecorder.record({
        context, messageType: message.originalType, requestType: metric.requestType,
        provider: metric.provider, model: metric.model,
        inputUnits: metric.inputUnits, outputUnits: metric.outputUnits, totalUnits: metric.totalUnits,
        preprocessingLatencyMs: message.preprocessingLatencyMs, providerLatencyMs: metric.latencyMs,
        totalLatencyMs: message.preprocessingLatencyMs,
        outcome: metric.succeeded ? 'success' : 'error', errorCode: metric.errorCode,
        occurredAt: this.now().toISOString(),
      });
    }
  }
}
