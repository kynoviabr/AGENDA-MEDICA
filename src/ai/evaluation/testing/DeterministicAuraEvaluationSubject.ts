import { createEmptyConversationState, type AiConversationResult, type AiConversationState } from '../../domain/conversation.ts';
import type { AiExecutionContext, AiNormalizedMessage } from '../../domain/models.ts';
import { resolveTemporalExpression } from '../../conversation/temporal.ts';
import { AuraAiResponseValidator } from '../../safety/AuraAiResponseValidator.ts';
import { ConversationStateToolPlanner } from '../../tools/ConversationStateToolPlanner.ts';
import type { AiToolRequest } from '../../tools/domain.ts';
import type {
  AiEvaluationLatency, AiEvaluationScenario, AiEvaluationSubject,
  AiEvaluationTurn, AiEvaluationTurnCapture,
} from '../domain.ts';
import { FixedEvaluationClock } from './FixedEvaluationClock.ts';

export class DeterministicAuraEvaluationSubject implements AiEvaluationSubject {
  private state: AiConversationState = createEmptyConversationState();
  private clock = new FixedEvaluationClock('2026-08-17T12:00:00.000Z', 'America/Sao_Paulo');
  private readonly seenMessageIds = new Set<string>();
  private readonly planner = new ConversationStateToolPlanner();
  constructor(private readonly validator = new AuraAiResponseValidator()) {}

  async setup(scenario: AiEvaluationScenario) {
    this.state = createEmptyConversationState();
    this.seenMessageIds.clear();
    this.clock = new FixedEvaluationClock(scenario.setup.fixedNow, scenario.setup.timezone);
  }

  async executeTurn(scenario: AiEvaluationScenario, turn: AiEvaluationTurn, turnIndex: number): Promise<AiEvaluationTurnCapture> {
    const output = turn.providerOutput;
    const entities = { ...this.state.entities, ...(output.entities || {}) } as Record<string, unknown>;
    for (const key of output.clearEntities || []) delete entities[key];
    if (typeof entities.date === 'string') entities.date = resolveTemporalExpression(
      entities.date, this.clock.now().toISOString(), scenario.setup.timezone,
    );
    this.state = {
      ...this.state,
      activeIntent: output.intent,
      entities: Object.fromEntries(Object.entries(entities).map(([key, value]) => [key, evidence(value)])),
      lastTurnAt: this.clock.now().toISOString(),
    };

    const context: AiExecutionContext = {
      clinicId: scenario.setup.clinic.id,
      conversationId: `eval-${scenario.id}`,
      correlationId: `eval-${scenario.id}-${turnIndex}`,
      channel: 'internal',
      patientId: scenario.setup.patient?.id,
    };
    const planned = this.planner.plan({ context, intent: output.intent, state: this.state, messageText: turn.input });
    const duplicate = this.seenMessageIds.has(turn.messageId || turn.id);
    this.seenMessageIds.add(turn.messageId || turn.id);
    const allowedTool = applyExecutionPolicy(planned, output.confirmed === true, duplicate);
    const toolCalls = allowedTool ? [{
      name: allowedTool.name,
      arguments: allowedTool.arguments,
      outcome: output.toolResult?.outcome,
    }] : [];
    const mutationCount = allowedTool?.kind === 'mutation' && output.toolResult?.outcome === 'success' ? 1 : 0;

    const message = normalizedMessage(scenario, turn, this.clock.now().toISOString());
    const conversation = conversationResult(output, this.state);
    const safety = this.validator.validate({
      context, message, conversation, draftResponse: output.responseDraft, toolResult: output.toolResult,
    });
    const latency = normalizeLatency(output.latency, safety.latencyMs);
    this.clock.advance(1_000);
    return {
      intent: output.intent,
      entities: Object.fromEntries(Object.entries(this.state.entities).map(([key, item]) => [key, item?.value])),
      toolCalls,
      mutationCount,
      safetyDisposition: safety.disposition,
      violations: safety.violations.map((item) => item.category),
      groundingSources: output.groundingSources || groundingLabels(output.toolResult?.data),
      factualClaims: output.factualClaims || [],
      supportedClaims: output.supportedClaims || [],
      response: safety.safeResponse || output.responseDraft,
      requiresClarification: output.requiresClarification || safety.requiresClarification || Boolean(output.ambiguity?.length),
      requiresHandoff: output.requiresHandoff || safety.requiresHandoff,
      tenantLeak: output.tenantLeak || safety.violations.some((item) => item.category === 'tenant_data_leak'),
      handoff: output.handoff,
      production: output.production,
      errorCode: output.errorCode,
      latency,
    };
  }

  async teardown() {
    this.state = createEmptyConversationState();
    this.seenMessageIds.clear();
  }
}

function evidence(value: unknown) {
  if (value && typeof value === 'object' && 'value' in value) return value;
  return { value, source: 'user_text' as const, confidence: 'high' as const, requiresConfirmation: false };
}

function applyExecutionPolicy(tool: AiToolRequest | null, confirmed: boolean, duplicate: boolean) {
  if (!tool || duplicate) return null;
  if (tool.kind === 'mutation' && !confirmed) return null;
  return tool;
}

function normalizedMessage(scenario: AiEvaluationScenario, turn: AiEvaluationTurn, now: string): AiNormalizedMessage {
  return {
    clinicId: scenario.setup.clinic.id,
    conversationId: `eval-${scenario.id}`,
    originalMessageId: turn.messageId || turn.id,
    originalType: turn.modality || 'text',
    receivedAt: now,
    normalizedText: turn.input,
    attachments: [],
    understandingMetadata: { needsClarification: false },
    processingMetrics: [],
    preprocessingLatencyMs: 0,
  };
}

function conversationResult(output: AiEvaluationTurn['providerOutput'], state: AiConversationState): AiConversationResult {
  return {
    intent: output.intent, state, stateRevision: 1, stateChanged: true, missingFields: [],
    clarification: output.ambiguity?.length ? { field: 'ambiguity', candidates: output.ambiguity, question: 'Qual opção você prefere?' } : undefined,
    readyForToolExecution: true, requiresHandoff: output.requiresHandoff || false,
    safetyDisposition: 'allowed', responsePlan: { kind: 'answer', responseText: output.responseDraft, oneQuestionOnly: true },
    responseText: output.responseDraft, confidence: 'high', provider: 'fake_llm', model: 'deterministic-v1',
    usage: {}, latencyMs: output.latency?.conversationMs || 1,
  };
}

function normalizeLatency(value: Partial<AiEvaluationLatency> | undefined, safetyMs: number): AiEvaluationLatency {
  const result = {
    preprocessingMs: value?.preprocessingMs ?? 1,
    conversationMs: value?.conversationMs ?? 2,
    toolsMs: value?.toolsMs ?? 1,
    knowledgeMs: value?.knowledgeMs ?? 0,
    safetyMs: value?.safetyMs ?? safetyMs,
    totalMs: value?.totalMs ?? 0,
  };
  result.totalMs ||= result.preprocessingMs + result.conversationMs + result.toolsMs + result.knowledgeMs + result.safetyMs;
  return result;
}

function groundingLabels(data: unknown): string[] {
  const serialized = JSON.stringify(data || {});
  return [...serialized.matchAll(/"table":"([^"]+)"/g)].map((match) => match[1]);
}
