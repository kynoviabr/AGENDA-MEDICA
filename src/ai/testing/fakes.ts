import type { AiClinicConfig, AiConversationMessage, AiExecutionContext } from '../domain/models.ts';
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

export class FakeAiConversationHistoryLoader implements AiConversationHistoryLoader {
  constructor(private readonly messages: readonly AiConversationMessage[] = []) {}
  async loadRecent(_context: AiExecutionContext, _limit: number) { return this.messages; }
}

export class InMemoryAiUsageRecorder implements AiUsageRecorder {
  readonly events: AiUsageEvent[] = [];
  async record(event: AiUsageEvent): Promise<void> { this.events.push(event); }
}
