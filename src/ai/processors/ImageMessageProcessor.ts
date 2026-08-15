import type { AiExecutionContext, AiInboundMessage, AiNormalizedMessage } from '../domain/models.ts';
import { AiValidationError, AiVisionError } from '../errors/AiError.ts';
import { restrictClinicalImageDescription } from '../policies/auraCorePolicy.ts';
import { validateAiMedia } from '../policies/mediaPolicy.ts';
import type { AiMediaLoader, AiVisionProvider } from '../providers/contracts.ts';
import { executeAiProviderCall, type AiProviderExecutionPolicy } from '../services/providerExecution.ts';
import type { AiMessageProcessor } from './AiMessageProcessor.ts';

export class ImageMessageProcessor implements AiMessageProcessor {
  constructor(
    private readonly mediaLoader: AiMediaLoader,
    private readonly visionProvider: AiVisionProvider,
    private readonly executionPolicy: AiProviderExecutionPolicy = { timeoutMs: 30_000, maxAttempts: 2 },
  ) {}

  async process(message: AiInboundMessage, _context: AiExecutionContext): Promise<AiNormalizedMessage> {
    const startedAt = performance.now();
    if (!message.media || message.media.kind !== 'image') throw new AiValidationError('Image media reference is required.');
    const media = await executeAiProviderCall(
      (signal) => this.mediaLoader.load(message.media!.mediaId, signal),
      { ...this.executionPolicy, maxAttempts: 1 },
    );
    validateAiMedia('image', media.mimeType, media.size);
    const providerStartedAt = performance.now();
    let result;
    try {
      result = await executeAiProviderCall(
        (signal) => this.visionProvider.understandAdministrativeImage(media, signal),
        this.executionPolicy,
      );
    } catch (error) {
      throw error instanceof AiVisionError ? error : new AiVisionError(error);
    }
    const restricted = restrictClinicalImageDescription(result.category);
    const disposition = restricted ? 'clinical_content_restricted' : 'administrative_only';
    return {
      clinicId: message.clinicId,
      conversationId: message.conversationId,
      originalMessageId: message.id,
      originalType: 'image',
      receivedAt: message.receivedAt,
      normalizedText: restricted || result.description,
      attachments: [{
        mediaId: message.media.mediaId, mimeType: media.mimeType, size: media.size,
        kind: 'image', category: result.category, processingStatus: 'processed',
      }],
      understandingMetadata: {
        imageCategory: result.category,
        safetyDisposition: disposition,
        needsClarification: result.category === 'unknown',
      },
      processingMetrics: [{
        requestType: 'vision', provider: result.provider, model: result.model,
        latencyMs: Math.max(0, Math.round(performance.now() - providerStartedAt)),
        inputUnits: result.usage.inputTokens, outputUnits: result.usage.outputTokens,
        totalUnits: result.usage.totalTokens, succeeded: true,
      }],
      preprocessingLatencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  }
}
