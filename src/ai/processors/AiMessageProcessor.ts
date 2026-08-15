import type { AiExecutionContext, AiInboundMessage, AiNormalizedMessage } from '../domain/models.ts';

export interface AiMessageProcessor {
  process(message: AiInboundMessage, context: AiExecutionContext): Promise<AiNormalizedMessage>;
}
