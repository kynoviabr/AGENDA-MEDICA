import type { AiConversationResult, AiConversationStateRepository } from '../domain/conversation.ts';
import type { AiClinicConfig, AiExecutionContext } from '../domain/models.ts';
import type { AiUsageRecorder } from '../usage/AiUsageRecorder.ts';
import { NoopAiUsageRecorder } from '../usage/AiUsageRecorder.ts';
import { executeAiProviderCall, type AiProviderExecutionPolicy } from '../services/providerExecution.ts';
import type { AiToolExecutor, AiToolPlanner, AiToolResult } from './domain.ts';

export interface AiCoordinatedToolResponse {
  text: string;
  provider: string;
  model: string;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  latencyMs: number;
  result: AiToolResult;
}

export interface AiToolCoordinator {
  executeIfPlanned(
    context: AiExecutionContext,
    conversation: AiConversationResult,
    config: AiClinicConfig,
    messageText: string,
  ): Promise<AiCoordinatedToolResponse | null>;
}

export class AuraToolCoordinator implements AiToolCoordinator {
  constructor(
    private readonly planner: AiToolPlanner,
    private readonly executor: AiToolExecutor,
    private readonly composer: import('./domain.ts').AiToolResponseComposer,
    private readonly stateRepository: AiConversationStateRepository,
    private readonly usageRecorder: AiUsageRecorder = new NoopAiUsageRecorder(),
    private readonly executionPolicy: AiProviderExecutionPolicy = { timeoutMs: 20_000, maxAttempts: 2 },
    private readonly now: () => Date = () => new Date(),
  ) {}

  async executeIfPlanned(context: AiExecutionContext, conversation: AiConversationResult, config: AiClinicConfig, messageText: string) {
    if (conversation.clarification || conversation.requiresHandoff || conversation.safetyDisposition === 'clinical_content_restricted') return null;
    const tool = this.planner.plan({ context, intent: conversation.intent, state: conversation.state, messageText });
    if (!tool) return null;
    const result = await this.executor.execute({
      context, conversationState: conversation.state,
      config: config.toolExecution || { readEnabled: false, mutationsEnabled: false }, tool,
    });
    await this.persistToolState(context, conversation, result);
    const sanitized = sanitizeForModel(result);
    const composed = await executeAiProviderCall((signal) => this.composer.compose({
      clinicName: config.clinicName, preferredLanguage: config.preferredLanguage,
      responseStyle: config.responseStyle, intent: conversation.intent, result: sanitized, signal,
    }), this.executionPolicy);
    await this.usageRecorder.record({
      context, messageType: 'text', requestType: 'tool_response', provider: composed.provider, model: composed.model,
      inputUnits: composed.usage.inputTokens, outputUnits: composed.usage.outputTokens, totalUnits: composed.usage.totalTokens,
      providerLatencyMs: composed.latencyMs, totalLatencyMs: composed.latencyMs,
      outcome: 'success', occurredAt: this.now().toISOString(),
    });
    return { ...composed, result };
  }

  private async persistToolState(context: AiExecutionContext, conversation: AiConversationResult, result: AiToolResult) {
    if (!result.presentedOptions?.length && !(result.kind === 'mutation' && result.outcome === 'success')) return;
    const next = {
      ...conversation.state,
      lastPresentedOptions: result.presentedOptions || conversation.state.lastPresentedOptions,
      pendingQuestion: result.presentedOptions?.length ? 'Qual opção você prefere?' : undefined,
      activeIntentStatus: result.kind === 'mutation' && result.outcome === 'success' ? 'completed' as const : conversation.state.activeIntentStatus,
    };
    await this.stateRepository.saveIfRevision(context.clinicId, context.conversationId, conversation.stateRevision, next);
  }
}

function sanitizeForModel(result: AiToolResult): AiToolResult {
  const data = stripTechnicalReferences(structuredClone(result.data));
  return {
    schemaVersion: 1, toolName: result.toolName, kind: result.kind, outcome: result.outcome,
    data, message: result.message, errorCode: result.errorCode,
    presentedOptions: result.presentedOptions?.map((item, index) => ({ ...item, id: String(index + 1), value: item.label })),
  };
}

function stripTechnicalReferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripTechnicalReferences);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !['id', 'recordId', 'reference', 'patientId', 'leadId', 'clinicId', 'professionalId', 'locationId', 'serviceId', 'insuranceId'].includes(key))
    .map(([key, item]) => [key, stripTechnicalReferences(item)]));
}
