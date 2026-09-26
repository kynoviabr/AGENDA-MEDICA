import type { AiExecutionContext, AiInboundMessage, AiNormalizedMessage } from '../domain/models.ts';
import { AiValidationError } from '../errors/AiError.ts';
import type { AiMessageProcessor } from './AiMessageProcessor.ts';

export function normalizeInboundText(value: string): string {
  return value
    .normalize('NFC')
    .split(String.fromCharCode(0)).join('')
    .replace(/\r\n?/g, '\n')
    .trim();
}

export class TextMessageProcessor implements AiMessageProcessor {
  async process(message: AiInboundMessage, _context: AiExecutionContext): Promise<AiNormalizedMessage> {
    const startedAt = performance.now();
    const normalizedText = normalizeInboundText(message.text || '');
    if (!normalizedText) throw new AiValidationError('Text message is empty.');
    return {
      clinicId: message.clinicId,
      conversationId: message.conversationId,
      originalMessageId: message.id,
      originalType: 'text',
      receivedAt: message.receivedAt,
      normalizedText,
      attachments: [],
      understandingMetadata: { needsClarification: false },
      processingMetrics: [],
      preprocessingLatencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  }
}
