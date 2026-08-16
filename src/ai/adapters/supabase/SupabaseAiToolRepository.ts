import type { AiToolAuditEvent, AiToolAuditRecorder, AiToolMutationGuard, AiToolRequest } from '../../tools/domain.ts';
import type { AiExecutionContext } from '../../domain/models.ts';
import type { AiKnowledgeAuditEvent, AiKnowledgeAuditRecorder } from '../../tools/AdministrativeKnowledgeToolExecutor.ts';
import { AiValidationError } from '../../errors/AiError.ts';
import type { AiSupabaseClientLike } from './SupabaseAiRuntimeRepository.ts';

export class SupabaseAiToolAuditRecorder implements AiToolAuditRecorder {
  constructor(private readonly client: AiSupabaseClientLike) {}
  async record(event: AiToolAuditEvent): Promise<void> {
    const { error } = await this.client.from('ai_tool_execution_events').insert({
      clinic_id: event.context.clinicId, conversation_id: event.context.conversationId,
      correlation_id: event.context.correlationId, tool_name: event.toolName, tool_kind: event.kind,
      outcome: event.outcome, error_code: event.errorCode || null, latency_ms: event.latencyMs,
      occurred_at: event.occurredAt,
    });
    if (error) throw new AiValidationError('AI tool audit persistence failed.', error);
  }
}

export class SupabaseAiToolMutationGuard implements AiToolMutationGuard {
  constructor(private readonly client: AiSupabaseClientLike) {}
  async claim(context: AiExecutionContext, tool: AiToolRequest): Promise<boolean> {
    if (!this.client.rpc) throw new AiValidationError('Atomic AI mutation guard is unavailable.');
    const { data, error } = await this.client.rpc('claim_ai_tool_mutation', {
      p_clinic_id: context.clinicId, p_conversation_id: context.conversationId,
      p_correlation_id: context.correlationId, p_tool_name: tool.name,
    });
    if (error) throw new AiValidationError('AI mutation claim failed.', error);
    return data === true;
  }
}

export class SupabaseAiKnowledgeAuditRecorder implements AiKnowledgeAuditRecorder {
  constructor(private readonly client: AiSupabaseClientLike) {}
  async record(event: AiKnowledgeAuditEvent): Promise<void> {
    const sourceRefs = event.sources.map((source) => ({
      sourceType: source.sourceType, table: source.table, recordId: source.recordId,
      field: source.field, revision: source.revision, verifiedAt: source.verifiedAt,
    }));
    const { error } = await this.client.from('ai_knowledge_answer_events').insert({
      clinic_id: event.context.clinicId, conversation_id: event.context.conversationId,
      correlation_id: event.context.correlationId, topic: event.topic, outcome: event.outcome,
      source_refs: sourceRefs, latency_ms: event.latencyMs, occurred_at: event.occurredAt,
    });
    if (error) throw new AiValidationError('AI knowledge audit persistence failed.', error);
  }
}
