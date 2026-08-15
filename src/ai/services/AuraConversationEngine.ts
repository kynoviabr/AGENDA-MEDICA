import {
  createEmptyConversationState,
  type AiClarificationRequest,
  type AiConversationDecision,
  type AiConversationIntent,
  type AiConversationInterpreter,
  type AiConversationResult,
  type AiConversationState,
  type AiConversationStatePatch,
  type AiResponsePlan,
  type AiRequiredFieldsPolicy,
} from '../domain/conversation.ts';
import type { AiClinicConfig, AiExecutionContext, AiNormalizedMessage } from '../domain/models.ts';
import type { AiConversationHistoryLoader } from './AuraAiOrchestrator.ts';
import { AiConversationInterpretationError, AiConversationStateConflictError, normalizeAiProviderError } from '../errors/AiError.ts';
import { evaluateAuraAdministrativeSafety } from '../policies/auraCorePolicy.ts';
import type { AiUsageRecorder } from '../usage/AiUsageRecorder.ts';
import { NoopAiUsageRecorder } from '../usage/AiUsageRecorder.ts';
import { DefaultAiRequiredFieldsPolicy, clarificationForMissingField } from '../conversation/missingInformation.ts';
import { resolvePresentedOptionReference } from '../conversation/references.ts';
import { conversationStateEquals, mergeConversationState, validateConversationState } from '../conversation/stateMerge.ts';
import { resolveTemporalExpression } from '../conversation/temporal.ts';
import { executeAiProviderCall, type AiProviderExecutionPolicy } from './providerExecution.ts';
import type { AiConversationStateRepository } from '../domain/conversation.ts';

const PRIMARY_INTENTS = new Set<AiConversationIntent>([
  'scheduling_request', 'reschedule_request', 'cancellation_request', 'confirmation_request', 'waitlist_request',
]);
const TEMPORARY_INTENTS = new Set<AiConversationIntent>([
  'greeting', 'administrative_question', 'professional_question', 'service_question', 'insurance_question',
  'price_question', 'location_question', 'unknown',
]);

export interface AuraConversationEngineOptions {
  historyLimit?: number;
  staleAfterMs?: number;
  maxStateSaveAttempts?: number;
  executionPolicy?: AiProviderExecutionPolicy;
  now?: () => Date;
  requiredFieldsPolicy?: AiRequiredFieldsPolicy;
}

export class AuraConversationEngine {
  private readonly historyLimit: number;
  private readonly staleAfterMs: number;
  private readonly maxStateSaveAttempts: number;
  private readonly executionPolicy: AiProviderExecutionPolicy;
  private readonly now: () => Date;
  private readonly requiredFieldsPolicy: AiRequiredFieldsPolicy;

  constructor(
    private readonly interpreter: AiConversationInterpreter,
    private readonly stateRepository: AiConversationStateRepository,
    private readonly historyLoader: AiConversationHistoryLoader,
    private readonly usageRecorder: AiUsageRecorder = new NoopAiUsageRecorder(),
    options: AuraConversationEngineOptions = {},
  ) {
    this.historyLimit = options.historyLimit ?? 10;
    this.staleAfterMs = options.staleAfterMs ?? 24 * 60 * 60 * 1000;
    this.maxStateSaveAttempts = options.maxStateSaveAttempts ?? 3;
    this.executionPolicy = options.executionPolicy ?? { timeoutMs: 30_000, maxAttempts: 2 };
    this.now = options.now ?? (() => new Date());
    this.requiredFieldsPolicy = options.requiredFieldsPolicy ?? new DefaultAiRequiredFieldsPolicy();
  }

  async process(
    context: AiExecutionContext,
    message: AiNormalizedMessage,
    config: AiClinicConfig,
    clinicContext: string,
  ): Promise<AiConversationResult> {
    const startedAt = performance.now();
    const occurredAt = this.now().toISOString();
    const turnAt = message.receivedAt || occurredAt;
    let persisted = await this.stateRepository.load(context.clinicId, context.conversationId);
    validateConversationState(persisted.state);
    const history = (await this.historyLoader.loadRecent(context, this.historyLimit))
      .filter((item) => item.clinicId === context.clinicId && item.conversationId === context.conversationId)
      .slice(-this.historyLimit);
    if (history.at(-1)?.role === 'user' && history.at(-1)?.text === message.normalizedText) history.pop();

    let interpretation;
    try {
      interpretation = await executeAiProviderCall((signal) => this.interpreter.interpret({
        state: persisted.state,
        history,
        message,
        clinicContext,
        preferredLanguage: config.preferredLanguage,
        responseStyle: config.responseStyle,
        timezone: config.timezone || 'America/Sao_Paulo',
        now: turnAt,
        signal,
      }), this.executionPolicy);
      if (!interpretation.responseText.trim()) throw new AiConversationInterpretationError();
    } catch (error) {
      const normalized = normalizeAiProviderError(error);
      await this.usageRecorder.record({
        context, messageType: message.originalType, requestType: 'conversation_interpretation',
        provider: this.interpreter.name, preprocessingLatencyMs: message.preprocessingLatencyMs,
        totalLatencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        outcome: 'error', errorCode: normalized.code, occurredAt,
      });
      throw normalized;
    }

    const safePatch = this.normalizePatch(interpretation.statePatch, message, config.timezone || 'America/Sao_Paulo', turnAt);
    const resolvedReference = interpretation.referenceExpression
      ? resolvePresentedOptionReference(interpretation.referenceExpression, persisted.state)
      : null;
    const patch: AiConversationStatePatch = resolvedReference ? {
      ...safePatch,
      operations: [...safePatch.operations, {
        field: 'selectedOption', operation: 'set', value: {
          value: resolvedReference.value, source: this.evidenceSource(message), confidence: 'high', requiresConfirmation: false,
        },
      }],
    } : safePatch;

    let result: AiConversationResult | null = null;
    for (let attempt = 1; attempt <= this.maxStateSaveAttempts; attempt += 1) {
      const previousState = this.prepareStateForIntent(persisted.state, interpretation.intent, interpretation.isSmallTalk, turnAt);
      let state = mergeConversationState(previousState, patch, turnAt);
      state = this.applyIntent(state, interpretation.intent, interpretation.isSmallTalk, interpretation.endsCurrentTask);
      const safety = evaluateAuraAdministrativeSafety(message.normalizedText);
      const decision = this.decide(state, interpretation, safety, resolvedReference?.label);
      state = { ...state, pendingQuestion: decision.clarification?.question };
      if (decision.readyForToolExecution) state = { ...state, activeIntentStatus: 'ready' };
      validateConversationState(state);
      const changed = !conversationStateEquals(persisted.state, state);
      const saved = changed
        ? await this.stateRepository.saveIfRevision(context.clinicId, context.conversationId, persisted.revision, state)
        : persisted;
      if (saved) {
        result = {
          intent: decision.intent, state: saved.state, stateRevision: saved.revision, stateChanged: changed,
          missingFields: decision.missingFields, clarification: decision.clarification,
          readyForToolExecution: decision.readyForToolExecution, requiresHandoff: decision.requiresHandoff,
          safetyDisposition: decision.safetyDisposition, responsePlan: decision.responsePlan,
          responseText: decision.responsePlan.responseText, confidence: decision.confidence,
          provider: interpretation.provider, model: interpretation.model, usage: interpretation.usage,
          latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        };
        break;
      }
      persisted = await this.stateRepository.load(context.clinicId, context.conversationId);
    }
    if (!result) throw new AiConversationStateConflictError();

    await this.usageRecorder.record({
      context, messageType: message.originalType, requestType: 'conversation_interpretation',
      provider: result.provider, model: result.model,
      inputUnits: result.usage.inputTokens, outputUnits: result.usage.outputTokens, totalUnits: result.usage.totalTokens,
      preprocessingLatencyMs: message.preprocessingLatencyMs,
      providerLatencyMs: interpretation.latencyMs,
      totalLatencyMs: result.latencyMs,
      outcome: 'success', occurredAt,
    });
    return result;
  }

  private normalizePatch(
    patch: AiConversationStatePatch,
    message: AiNormalizedMessage,
    timezone: string,
    occurredAt: string,
  ): AiConversationStatePatch {
    const source = this.evidenceSource(message);
    const operations = patch.operations.map((operation) => {
      if (operation.operation === 'clear') return operation;
      let value = { ...operation.value, source, requiresConfirmation: operation.value.requiresConfirmation || source === 'image_extraction' || source === 'document_extraction' };
      if (operation.field === 'date') {
        const temporal = value.value as unknown;
        if (typeof temporal === 'string') value = { ...value, value: resolveTemporalExpression(temporal, occurredAt, timezone) } as typeof value;
        else if (temporal && typeof temporal === 'object') {
          const current = temporal as { raw?: string; resolvedDate?: string };
          if (current.raw && !current.resolvedDate) value = { ...value, value: { ...resolveTemporalExpression(current.raw, occurredAt, timezone), ...current, timezone } } as typeof value;
        }
      }
      return { ...operation, value };
    });
    const setsPrivate = operations.some((item) => item.operation === 'set' && item.field === 'billingType' && item.value.value === 'private');
    const touchesInsurance = operations.some((item) => item.field === 'insurance');
    if (setsPrivate && !touchesInsurance) operations.push({ field: 'insurance', operation: 'clear' });
    const setsInsurance = operations.some((item) => item.operation === 'set' && item.field === 'insurance');
    const touchesBilling = operations.some((item) => item.field === 'billingType');
    if (setsInsurance && !touchesBilling) operations.push({
      field: 'billingType', operation: 'set', value: { value: 'insurance', source, confidence: 'high', requiresConfirmation: false },
    });
    return { ...patch, operations };
  }

  private evidenceSource(message: AiNormalizedMessage) {
    if (message.originalType === 'audio') return 'transcription' as const;
    if (message.originalType === 'image') return 'image_extraction' as const;
    if (message.originalType === 'document') return 'document_extraction' as const;
    return 'user_text' as const;
  }

  private prepareStateForIntent(state: AiConversationState, intent: AiConversationIntent, smallTalk: boolean, occurredAt: string) {
    const last = state.lastTurnAt ? new Date(state.lastTurnAt).getTime() : 0;
    const stale = last > 0 && new Date(occurredAt).getTime() - last > this.staleAfterMs;
    const startsPrimary = PRIMARY_INTENTS.has(intent);
    if (startsPrimary && (stale || state.activeIntentStatus === 'completed' || state.activeIntentStatus === 'abandoned')) {
      return createEmptyConversationState();
    }
    if (smallTalk || TEMPORARY_INTENTS.has(intent)) return state;
    return state;
  }

  private applyIntent(state: AiConversationState, intent: AiConversationIntent, smallTalk: boolean, endsTask: boolean) {
    if (endsTask) return { ...state, activeIntentStatus: 'abandoned' as const };
    if (smallTalk || TEMPORARY_INTENTS.has(intent)) return state;
    return { ...state, activeIntent: intent, activeIntentStatus: 'collecting' as const };
  }

  private decide(
    state: AiConversationState,
    interpretation: Awaited<ReturnType<AiConversationInterpreter['interpret']>>,
    safety: ReturnType<typeof evaluateAuraAdministrativeSafety>,
    resolvedReference?: string,
  ): AiConversationDecision {
    const restricted = safety.disposition === 'clinical_content_restricted' || interpretation.safetyDisposition === 'clinical_content_restricted';
    const intentForRequirements = interpretation.intent;
    const missingFields = this.requiredFieldsPolicy.requiredFor(intentForRequirements, state);
    let clarification: AiClarificationRequest | undefined;
    if (interpretation.ambiguity) clarification = {
      field: 'ambiguity', candidates: interpretation.ambiguity.candidates,
      question: `Encontrei mais de uma opção: ${interpretation.ambiguity.candidates.join(' ou ')}. Qual delas você prefere?`,
    };
    else if (state.entities.insuranceCandidate?.requiresConfirmation && !state.entities.insurance) clarification = {
      field: 'confirmation', question: `Identifiquei ${state.entities.insuranceCandidate.value} na imagem. É esse o convênio que você quer usar?`,
    };
    else if (missingFields[0]) clarification = { field: missingFields[0], question: clarificationForMissingField(missingFields[0]) };

    const requiresHandoff = interpretation.requiresHandoff || interpretation.intent === 'human_handoff' || safety.requiresHandoff;
    const readyForToolExecution = PRIMARY_INTENTS.has(intentForRequirements) && !restricted && !requiresHandoff && !clarification && missingFields.length === 0;
    let responsePlan: AiResponsePlan;
    if (restricted) responsePlan = {
      kind: 'refuse_medical', oneQuestionOnly: true,
      responseText: PRIMARY_INTENTS.has(interpretation.intent)
        ? `Não consigo avaliar sintomas ou imagens, mas posso ajudar com o pedido administrativo. ${clarification?.question || 'Já registrei as informações administrativas que você enviou.'}`
        : (safety.responseText || 'Não consigo fazer avaliação clínica. Posso encaminhar sua mensagem para a equipe.'),
    };
    else if (requiresHandoff) responsePlan = { kind: 'request_handoff', oneQuestionOnly: true, responseText: 'Claro. Vou encaminhar sua conversa para uma pessoa da recepção.' };
    else if (clarification) responsePlan = { kind: 'ask_clarification', oneQuestionOnly: true, responseText: clarification.question };
    else if (safety.responseText) responsePlan = { kind: 'answer', oneQuestionOnly: true, responseText: safety.responseText };
    else if (readyForToolExecution) responsePlan = { kind: 'ready_for_tool', oneQuestionOnly: true, responseText: 'Perfeito, já tenho as informações necessárias para verificar o próximo passo.' };
    else if (interpretation.isCorrection) responsePlan = {
      kind: 'acknowledge_correction', oneQuestionOnly: true,
      responseText: this.shortResponse(interpretation.responseText.trim() || 'Perfeito, atualizei essa informação.'),
    };
    else responsePlan = { kind: 'answer', oneQuestionOnly: true, responseText: this.shortResponse(interpretation.responseText) };

    return {
      intent: interpretation.intent, statePatch: interpretation.statePatch, missingFields, clarification,
      referencesResolved: resolvedReference ? [resolvedReference] : [], readyForToolExecution,
      requiresHandoff, safetyDisposition: restricted
        ? 'clinical_content_restricted'
        : (requiresHandoff ? 'requires_handoff' : (safety.disposition === 'allowed' ? interpretation.safetyDisposition : safety.disposition)),
      responsePlan, confidence: interpretation.confidence,
    };
  }

  private shortResponse(value: string) {
    const trimmed = value.trim().slice(0, 600);
    const firstQuestion = trimmed.indexOf('?');
    if (firstQuestion < 0) return trimmed;
    return trimmed.slice(0, firstQuestion + 1);
  }
}
