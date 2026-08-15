import type { AiClinicConfig, AiConversationMessage, AiExecutionContext } from '../domain/models.ts';
import {
  createEmptyConversationState,
  type AiConversationInterpretation,
  type AiConversationInterpreter,
  type AiConversationInterpreterRequest,
  type AiConversationState,
  type AiConversationStateRepository,
  type AiPersistedConversationState,
} from '../domain/conversation.ts';
import type {
  AiBinaryInput,
  AiLlmProvider,
  AiLlmRequest,
  AiLlmResult,
  AiTranscriptionProvider,
  AiTranscriptionResult,
  AiVisionProvider,
  AiVisionResult,
} from '../providers/contracts.ts';
import type { AiClinicConfigLoader, AiConversationHistoryLoader } from '../services/AuraAiOrchestrator.ts';
import type { AiUsageEvent, AiUsageRecorder } from '../usage/AiUsageRecorder.ts';

export class FakeLlmProvider implements AiLlmProvider {
  readonly name = 'fake_llm';
  readonly requests: AiLlmRequest[] = [];
  constructor(private readonly result: AiLlmResult | Error = {
    responseText: 'Olá! Como posso ajudar?', provider: 'fake_llm', model: 'fake-model', usage: {},
    requiresClarification: false, requiresHandoff: false, safetyDisposition: 'allowed',
  }) {}
  async generate(request: AiLlmRequest): Promise<AiLlmResult> {
    this.requests.push(request);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

export class FakeTranscriptionProvider implements AiTranscriptionProvider {
  readonly name = 'fake_transcription';
  readonly inputs: AiBinaryInput[] = [];
  constructor(private readonly result: AiTranscriptionResult | Error) {}
  async transcribe(input: AiBinaryInput): Promise<AiTranscriptionResult> {
    this.inputs.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

export class FakeVisionProvider implements AiVisionProvider {
  readonly name = 'fake_vision';
  readonly inputs: AiBinaryInput[] = [];
  constructor(private readonly result: AiVisionResult | Error) {}
  async understandAdministrativeImage(input: AiBinaryInput): Promise<AiVisionResult> {
    this.inputs.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

export class FakeAiClinicConfigLoader implements AiClinicConfigLoader {
  constructor(private readonly config: AiClinicConfig) {}
  async load(_context: AiExecutionContext): Promise<AiClinicConfig> { return this.config; }
}

export class FakeConversationInterpreter implements AiConversationInterpreter {
  readonly name = 'fake_conversation';
  readonly requests: AiConversationInterpreterRequest[] = [];
  constructor(
    private readonly result: AiConversationInterpretation | Error | ((request: AiConversationInterpreterRequest) => AiConversationInterpretation),
  ) {}
  async interpret(request: AiConversationInterpreterRequest): Promise<AiConversationInterpretation> {
    this.requests.push(request);
    if (this.result instanceof Error) throw this.result;
    return typeof this.result === 'function' ? this.result(request) : this.result;
  }
}

export class InMemoryAiConversationStateRepository implements AiConversationStateRepository {
  private value: AiPersistedConversationState;
  saveCalls = 0;
  conflictsRemaining = 0;
  constructor(state: AiConversationState = createEmptyConversationState(), revision = 0) {
    this.value = { state: structuredClone(state), revision };
  }
  async load(_clinicId: string, _conversationId: string): Promise<AiPersistedConversationState> {
    return structuredClone(this.value);
  }
  async saveIfRevision(
    _clinicId: string, _conversationId: string, expectedRevision: number, state: AiConversationState,
  ): Promise<AiPersistedConversationState | null> {
    this.saveCalls += 1;
    if (this.conflictsRemaining > 0) {
      this.conflictsRemaining -= 1;
      this.value = { ...this.value, revision: this.value.revision + 1 };
      return null;
    }
    if (this.value.revision !== expectedRevision) return null;
    this.value = { state: structuredClone(state), revision: expectedRevision + 1 };
    return structuredClone(this.value);
  }
  snapshot() { return structuredClone(this.value); }
}

export class FakeAiConversationHistoryLoader implements AiConversationHistoryLoader {
  constructor(private readonly messages: readonly AiConversationMessage[] = []) {}
  async loadRecent(_context: AiExecutionContext, _limit: number) { return this.messages; }
}

export class InMemoryAiUsageRecorder implements AiUsageRecorder {
  readonly events: AiUsageEvent[] = [];
  async record(event: AiUsageEvent): Promise<void> { this.events.push(event); }
}
