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
import type { AiToolCoordinator } from '../tools/AuraToolCoordinator.ts';
import { AuraAiResponseValidator } from '../safety/AuraAiResponseValidator.ts';
import { AI_SAFE_TEMPLATES } from '../safety/templates.ts';
import { NoopAiSafetyAuditRecorder, type AiSafetyAuditRecorder, type AiSafetyValidationResult } from '../safety/domain.ts';
import type { AuraHandoffService } from '../handoff/AuraHandoffService.ts';
import { handoffPolicyForConversation, handoffPolicyForSafety } from '../handoff/policies.ts';
import type { AiHandoffFeatureConfig, AiHandoffRecord } from '../handoff/domain.ts';

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
    private readonly toolCoordinator?: AiToolCoordinator,
    private readonly responseValidator = new AuraAiResponseValidator(),
    private readonly safetyAudit: AiSafetyAuditRecorder = new NoopAiSafetyAuditRecorder(),
    private readonly handoffService?: AuraHandoffService,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async respond(context: AiExecutionContext, message: AiNormalizedMessage): Promise<AiResponse> {
    this.validateContext(context, message);
    await this.recordPreprocessing(context, message);
    const config = await this.clinicConfigLoader.load(context);
    if (config.clinicId !== context.clinicId) throw new AiValidationError('Clinic configuration crossed the tenant boundary.');
    if (!config.enabled) throw new AiValidationError('Aura AI is disabled for this clinic.');
    await this.handoffService?.assertAiActive(context);
    const inputDecision = this.responseValidator.inspectInput(message.normalizedText);
    if (inputDecision) {
      const result: AiSafetyValidationResult = {
        disposition: inputDecision.category === 'emergency_language' ? 'require_handoff' : 'block',
        violations: [{ category: inputDecision.category, validator: 'input_policy', severity: inputDecision.category === 'emergency_language' ? 'critical' : 'high' }],
        grounded: true, requiresClarification: false, requiresHandoff: inputDecision.requiresHandoff,
        safeResponse: inputDecision.safeResponse, latencyMs: 0,
      };
      await this.recordSafety(context, result);
      const preflightPolicy = handoffPolicyForSafety(result.disposition, result.violations.map((item) => item.category));
      const handoff = await this.requestHandoff(context, config.handoff, preflightPolicy ? {
        ...preflightPolicy, violations: result.violations.map((item) => item.category),
      } : null);
      return this.preflightResponse(result, handoff);
    }
    const conversation = await this.conversationEngine.process(context, message, config, this.buildClinicContext(config));
    const toolResponse = await this.toolCoordinator?.executeIfPlanned(context, conversation, config, message.normalizedText);
    const draft = toolResponse?.text || conversation.responseText;
    let validation: AiSafetyValidationResult;
    try {
      validation = this.responseValidator.validate({
        context, message, conversation, draftResponse: draft, toolResult: toolResponse?.result,
      });
    } catch {
      validation = {
        disposition: 'require_handoff', violations: [{ category: 'unsupported_claim', validator: 'fail_closed', severity: 'critical' }],
        grounded: false, requiresClarification: false, requiresHandoff: true,
        safeResponse: AI_SAFE_TEMPLATES.technical, latencyMs: 0,
      };
    }
    await this.recordSafety(context, validation);
    const safetySignal = handoffPolicyForSafety(validation.disposition, validation.violations.map((item) => item.category));
    const conversationSignal = handoffPolicyForConversation(conversation.intent, conversation.requiresHandoff);
    const handoff = await this.requestHandoff(context, config.handoff, safetySignal
      ? { ...safetySignal, violations: validation.violations.map((item) => item.category), conversation, toolResult: toolResponse?.result }
      : conversationSignal ? { ...conversationSignal, conversation, toolResult: toolResponse?.result } : null);
    if (!handoff && this.handoffService && config.handoff) {
      if (validation.requiresClarification || conversation.clarification) {
        await this.safeOperationalFailure(context, config.handoff, 'repeated_ambiguity');
      } else if (toolResponse?.result.outcome === 'error') {
        await this.safeOperationalFailure(context, config.handoff, toolResponse.result.kind === 'mutation' ? 'mutation_failure' : 'provider_unavailable');
      } else if (validation.disposition === 'allow' || validation.disposition === 'rewrite_safe') {
        await this.handoffService.recordSuccess(context).catch(() => undefined);
      }
    }
    return {
      text: validation.safeResponse || AI_SAFE_TEMPLATES.technical,
      provider: toolResponse?.provider || conversation.provider,
      model: toolResponse?.model || conversation.model,
      usage: toolResponse?.usage || conversation.usage,
      latencyMs: conversation.latencyMs + (toolResponse?.latencyMs || 0) + validation.latencyMs,
      safetyDisposition: validation.requiresHandoff ? 'requires_handoff' : conversation.safetyDisposition,
      requiresClarification: validation.requiresClarification || Boolean(conversation.clarification),
      requiresHandoff: validation.requiresHandoff || conversation.requiresHandoff,
      conversationIntent: conversation.intent,
      readyForToolExecution: conversation.readyForToolExecution && !toolResponse,
      responseSafetyDisposition: validation.disposition,
      safetyViolationCategories: validation.violations.map((item) => item.category),
      handoffOperational: Boolean(handoff), handoffId: handoff?.id,
    };
  }

  private preflightResponse(validation: AiSafetyValidationResult, handoff?: AiHandoffRecord | null): AiResponse {
    return {
      text: validation.safeResponse || AI_SAFE_TEMPLATES.technical, provider: 'aura_safety', model: 'deterministic-v1',
      usage: {}, latencyMs: validation.latencyMs,
      safetyDisposition: validation.requiresHandoff ? 'requires_handoff' : 'administrative_only',
      requiresClarification: validation.requiresClarification, requiresHandoff: validation.requiresHandoff,
      responseSafetyDisposition: validation.disposition,
      safetyViolationCategories: validation.violations.map((item) => item.category),
      handoffOperational: Boolean(handoff), handoffId: handoff?.id,
    };
  }

  private async requestHandoff(
    context: AiExecutionContext,
    config: AiHandoffFeatureConfig | undefined,
    signal: Parameters<AuraHandoffService['requestAutomatic']>[2] | null,
  ) {
    if (!this.handoffService || !config || !signal) return null;
    try { return await this.handoffService.requestAutomatic(context, config, signal); } catch { return null; }
  }

  private async safeOperationalFailure(
    context: AiExecutionContext,
    config: AiHandoffFeatureConfig,
    reason: Parameters<AuraHandoffService['recordOperationalFailure']>[2],
  ) {
    try { return await this.handoffService?.recordOperationalFailure(context, config, reason); } catch { return null; }
  }

  private async recordSafety(context: AiExecutionContext, result: AiSafetyValidationResult) {
    try {
      await this.safetyAudit.record({
        context, disposition: result.disposition, categories: result.violations.map((item) => item.category),
        validator: 'deterministic_v1', grounded: result.grounded, latencyMs: result.latencyMs,
        occurredAt: this.now().toISOString(),
      });
    } catch {
      // Audit contains no content and must not cause a validated response to be regenerated.
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
