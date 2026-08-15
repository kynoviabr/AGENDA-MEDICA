import type {
  AiClinicConfig,
  AiConversationMessage,
  AiExecutionContext,
  AiNormalizedMessage,
  AiResponse,
} from '../domain/models.ts';
import { AiValidationError, normalizeAiProviderError } from '../errors/AiError.ts';
import { AURA_CORE_POLICY, evaluateAuraAdministrativeSafety } from '../policies/auraCorePolicy.ts';
import type { AiLlmProvider } from '../providers/contracts.ts';
import type { AiUsageRecorder } from '../usage/AiUsageRecorder.ts';
import { NoopAiUsageRecorder } from '../usage/AiUsageRecorder.ts';
import { executeAiProviderCall, type AiProviderExecutionPolicy } from './providerExecution.ts';

export interface AiClinicConfigLoader {
  load(context: AiExecutionContext): Promise<AiClinicConfig>;
}

export interface AiConversationHistoryLoader {
  loadRecent(context: AiExecutionContext, limit: number): Promise<readonly AiConversationMessage[]>;
}

export interface AuraAiOrchestratorOptions {
  model: string;
  historyLimit?: number;
  executionPolicy?: AiProviderExecutionPolicy;
  now?: () => Date;
}

export class AuraAiOrchestrator {
  private readonly historyLimit: number;
  private readonly executionPolicy: AiProviderExecutionPolicy;
  private readonly now: () => Date;

  constructor(
    private readonly llmProvider: AiLlmProvider,
    private readonly clinicConfigLoader: AiClinicConfigLoader,
    private readonly historyLoader: AiConversationHistoryLoader,
    private readonly usageRecorder: AiUsageRecorder = new NoopAiUsageRecorder(),
    private readonly options: AuraAiOrchestratorOptions,
  ) {
    this.historyLimit = options.historyLimit ?? 10;
    this.executionPolicy = options.executionPolicy ?? { timeoutMs: 30_000, maxAttempts: 2 };
    this.now = options.now ?? (() => new Date());
  }

  async respond(context: AiExecutionContext, message: AiNormalizedMessage): Promise<AiResponse> {
    const totalStartedAt = performance.now();
    this.validateContext(context, message);
    await this.recordPreprocessing(context, message);
    const config = await this.clinicConfigLoader.load(context);
    if (config.clinicId !== context.clinicId) throw new AiValidationError('Clinic configuration crossed the tenant boundary.');
    if (!config.enabled) throw new AiValidationError('Aura AI is disabled for this clinic.');

    const policyDecision = evaluateAuraAdministrativeSafety(message.normalizedText);
    if (policyDecision.responseText) {
      const response: AiResponse = {
        text: policyDecision.responseText,
        provider: 'aura_policy', model: 'deterministic-core-policy', usage: {},
        latencyMs: Math.max(0, Math.round(performance.now() - totalStartedAt)),
        safetyDisposition: policyDecision.disposition,
        requiresClarification: message.understandingMetadata.needsClarification,
        requiresHandoff: policyDecision.requiresHandoff,
      };
      await this.recordLlmUsage(context, message, response, 'success');
      return response;
    }

    const history = (await this.historyLoader.loadRecent(context, this.historyLimit))
      .filter((item) => item.clinicId === context.clinicId && item.conversationId === context.conversationId)
      .slice(-this.historyLimit);
    if (history.at(-1)?.role === 'user' && history.at(-1)?.text === message.normalizedText) history.pop();
    const providerStartedAt = performance.now();
    try {
      const result = await executeAiProviderCall(
        (signal) => this.llmProvider.generate({
          model: this.options.model,
          corePolicy: AURA_CORE_POLICY,
          clinicContext: this.buildClinicContext(config),
          conversation: history,
          currentMessage: message.normalizedText,
          preferredLanguage: config.preferredLanguage,
          responseStyle: config.responseStyle,
          signal,
        }),
        this.executionPolicy,
      );
      if (!result.responseText.trim()) throw new AiValidationError('LLM returned an empty response.');
      const response: AiResponse = {
        text: result.responseText.trim(), provider: result.provider, model: result.model,
        finishReason: result.finishReason, usage: result.usage,
        latencyMs: Math.max(0, Math.round(performance.now() - providerStartedAt)),
        safetyDisposition: result.safetyDisposition,
        detectedLanguage: result.detectedLanguage,
        requiresClarification: result.requiresClarification || message.understandingMetadata.needsClarification,
        requiresHandoff: result.requiresHandoff,
      };
      await this.recordLlmUsage(context, message, response, 'success', Math.round(performance.now() - totalStartedAt));
      return response;
    } catch (error) {
      const normalized = normalizeAiProviderError(error);
      await this.usageRecorder.record({
        context, messageType: message.originalType, requestType: 'llm_response',
        provider: this.llmProvider.name, model: this.options.model,
        preprocessingLatencyMs: message.preprocessingLatencyMs,
        providerLatencyMs: Math.max(0, Math.round(performance.now() - providerStartedAt)),
        totalLatencyMs: Math.max(0, Math.round(performance.now() - totalStartedAt)),
        outcome: 'error', errorCode: normalized.code, occurredAt: this.now().toISOString(),
      });
      throw normalized;
    }
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

  private recordLlmUsage(
    context: AiExecutionContext,
    message: AiNormalizedMessage,
    response: AiResponse,
    outcome: 'success' | 'error',
    totalLatencyMs = response.latencyMs + message.preprocessingLatencyMs,
  ) {
    return this.usageRecorder.record({
      context, messageType: message.originalType, requestType: 'llm_response',
      provider: response.provider, model: response.model,
      inputUnits: response.usage.inputTokens, outputUnits: response.usage.outputTokens,
      totalUnits: response.usage.totalTokens, preprocessingLatencyMs: message.preprocessingLatencyMs,
      providerLatencyMs: response.latencyMs, totalLatencyMs, outcome,
      occurredAt: this.now().toISOString(),
    });
  }
}
