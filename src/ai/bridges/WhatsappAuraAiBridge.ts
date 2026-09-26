import type { AiExecutionContext, AiInboundMessage, AiResponse } from '../domain/models.ts';
import { normalizeAiProviderError } from '../errors/AiError.ts';
import type { AiMessageIngestionService } from '../services/AiMessageIngestionService.ts';
import type { AuraAiOrchestrator } from '../services/AuraAiOrchestrator.ts';
import { NoopAiUsageRecorder, type AiUsageRecorder, type AiUsageRequestType } from '../usage/AiUsageRecorder.ts';

export type WhatsappAiEngineMode = 'legacy' | 'shadow' | 'active';

export interface WhatsappAiExecutionDecision {
  runLegacy: boolean;
  runAura: boolean;
  sendLegacy: boolean;
  sendAura: boolean;
}

export function decideWhatsappAiExecution(mode: WhatsappAiEngineMode): WhatsappAiExecutionDecision {
  if (mode === 'active') return { runLegacy: false, runAura: true, sendLegacy: false, sendAura: true };
  if (mode === 'shadow') return { runLegacy: true, runAura: true, sendLegacy: true, sendAura: false };
  return { runLegacy: true, runAura: false, sendLegacy: true, sendAura: false };
}

export class WhatsappAuraAiBridge {
  constructor(
    private readonly ingestion: AiMessageIngestionService,
    private readonly orchestrator: AuraAiOrchestrator,
    private readonly usageRecorder: AiUsageRecorder = new NoopAiUsageRecorder(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async process(context: AiExecutionContext, inbound: AiInboundMessage): Promise<AiResponse> {
    const startedAt = performance.now();
    let normalized;
    try {
      normalized = await this.ingestion.ingest(inbound, context);
    } catch (error) {
      const normalizedError = normalizeAiProviderError(error);
      await this.usageRecorder.record({
        context,
        messageType: inbound.messageType,
        requestType: this.requestTypeFor(inbound.messageType),
        provider: 'aura_ingestion',
        totalLatencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        outcome: 'error',
        errorCode: normalizedError.code,
        occurredAt: this.now().toISOString(),
      });
      throw normalizedError;
    }
    return this.orchestrator.respond(context, normalized);
  }

  private requestTypeFor(messageType: AiInboundMessage['messageType']): AiUsageRequestType {
    if (messageType === 'audio') return 'transcription';
    if (messageType === 'image') return 'vision';
    if (messageType === 'document') return 'document_preprocessing';
    return 'llm_response';
  }
}
