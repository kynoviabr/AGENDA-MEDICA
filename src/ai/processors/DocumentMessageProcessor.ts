import type { AiExecutionContext, AiInboundMessage, AiNormalizedMessage } from '../domain/models.ts';
import { AiValidationError } from '../errors/AiError.ts';
import { AI_MEDIA_POLICY } from '../policies/mediaPolicy.ts';
import type { AiMessageProcessor } from './AiMessageProcessor.ts';

export class DocumentMessageProcessor implements AiMessageProcessor {
  async process(message: AiInboundMessage, _context: AiExecutionContext): Promise<AiNormalizedMessage> {
    const startedAt = performance.now();
    if (!message.media || message.media.kind !== 'document') throw new AiValidationError('Document media reference is required.');
    const supported = (AI_MEDIA_POLICY.document.allowedMimeTypes as readonly string[]).includes(message.media.mimeType);
    return {
      clinicId: message.clinicId,
      conversationId: message.conversationId,
      originalMessageId: message.id,
      originalType: 'document',
      normalizedText: supported
        ? 'O paciente enviou um documento. A leitura completa deste formato ainda requer atendimento da equipe.'
        : 'O paciente enviou um documento em formato ainda não suportado.',
      attachments: [{
        mediaId: message.media.mediaId, mimeType: message.media.mimeType, size: message.media.size,
        kind: 'document', processingStatus: 'unsupported',
      }],
      understandingMetadata: { safetyDisposition: 'administrative_only', needsClarification: true },
      processingMetrics: [{
        requestType: 'document_preprocessing', provider: 'aura', model: undefined,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)), succeeded: supported,
        errorCode: supported ? undefined : 'UNSUPPORTED_DOCUMENT_MIME',
      }],
      preprocessingLatencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  }
}
