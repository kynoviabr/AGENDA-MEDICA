import type { AiExecutionContext, AiInboundMessage, AiNormalizedMessage } from '../domain/models.ts';
import { AiTranscriptionError, AiValidationError } from '../errors/AiError.ts';
import { validateAiMedia } from '../policies/mediaPolicy.ts';
import type { AiMediaLoader, AiTranscriptionProvider } from '../providers/contracts.ts';
import { executeAiProviderCall, type AiProviderExecutionPolicy } from '../services/providerExecution.ts';
import type { AiMessageProcessor } from './AiMessageProcessor.ts';
import { normalizeInboundText } from './TextMessageProcessor.ts';

export class AudioMessageProcessor implements AiMessageProcessor {
  constructor(
    private readonly mediaLoader: AiMediaLoader,
    private readonly transcriptionProvider: AiTranscriptionProvider,
    private readonly executionPolicy: AiProviderExecutionPolicy = { timeoutMs: 25_000, maxAttempts: 2 },
  ) {}

  async process(message: AiInboundMessage, _context: AiExecutionContext): Promise<AiNormalizedMessage> {
    const startedAt = performance.now();
    if (!message.media || message.media.kind !== 'audio') throw new AiValidationError('Audio media reference is required.');
    const media = await executeAiProviderCall(
      (signal) => this.mediaLoader.load(message.media!.mediaId, signal),
      { ...this.executionPolicy, maxAttempts: 1 },
    );
    validateAiMedia('audio', media.mimeType, media.size);
    const providerStartedAt = performance.now();
    let result;
    try {
      result = await executeAiProviderCall(
        (signal) => this.transcriptionProvider.transcribe(media, signal),
        this.executionPolicy,
      );
    } catch (error) {
      throw error instanceof AiTranscriptionError ? error : new AiTranscriptionError(error);
    }
    const providerLatencyMs = Math.max(0, Math.round(performance.now() - providerStartedAt));
    const normalizedText = normalizeInboundText(result.text || '');
    const needsClarification = !normalizedText;
    return {
      clinicId: message.clinicId,
      conversationId: message.conversationId,
      originalMessageId: message.id,
      originalType: 'audio',
      normalizedText: normalizedText || 'O áudio recebido não pôde ser compreendido.',
      attachments: [{
        mediaId: message.media.mediaId, mimeType: media.mimeType, size: media.size,
        kind: 'audio', processingStatus: normalizedText ? 'processed' : 'failed',
      }],
      understandingMetadata: { detectedLanguage: result.language, needsClarification },
      processingMetrics: [{
        requestType: 'transcription', provider: result.provider, model: result.model,
        latencyMs: providerLatencyMs, inputUnits: result.usageUnits, totalUnits: result.usageUnits,
        succeeded: Boolean(normalizedText), errorCode: normalizedText ? undefined : 'EMPTY_TRANSCRIPTION',
      }],
      preprocessingLatencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  }
}
