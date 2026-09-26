import type { AiExecutionContext, AiInboundMessage, AiMessageType, AiNormalizedMessage } from '../domain/models.ts';
import { AiValidationError } from '../errors/AiError.ts';
import type { AiMessageProcessor } from '../processors/AiMessageProcessor.ts';

export class AiMessageIngestionService {
  constructor(private readonly processors: Readonly<Record<AiMessageType, AiMessageProcessor>>) {}

  async ingest(message: AiInboundMessage, context: AiExecutionContext): Promise<AiNormalizedMessage> {
    if (!context.clinicId || !context.conversationId || !context.correlationId) {
      throw new AiValidationError('AI execution context is incomplete.');
    }
    if (message.clinicId !== context.clinicId || message.conversationId !== context.conversationId) {
      throw new AiValidationError('Inbound message does not belong to the AI execution context.');
    }
    if (message.channel !== context.channel) throw new AiValidationError('Inbound channel does not match execution context.');
    return this.processors[message.messageType].process(message, context);
  }
}
