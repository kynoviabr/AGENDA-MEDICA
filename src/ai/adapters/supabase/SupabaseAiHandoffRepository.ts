import { AiValidationError } from '../../errors/AiError.ts';
import type {
  AiConversationControl, AiHandoffRecord, AiHandoffRepository, AiHandoffRequest, AiHandoffReason,
} from '../../handoff/domain.ts';
import type { AiExecutionContext } from '../../domain/models.ts';
import type { AiConversationControlGuard } from '../../tools/domain.ts';
import type { AiSupabaseClientLike } from './SupabaseAiRuntimeRepository.ts';

type HandoffRow = {
  id: string; clinic_id: string; conversation_id: string; reason: AiHandoffRecord['reason'];
  priority: AiHandoffRecord['priority']; source: AiHandoffRecord['source']; status: AiHandoffRecord['status'];
  assigned_user_id?: string | null; requested_at: string; summary: AiHandoffRecord['summary'];
};

export class SupabaseAiHandoffRepository implements AiHandoffRepository {
  constructor(private readonly client: AiSupabaseClientLike) {}

  async loadControl(context: AiExecutionContext): Promise<AiConversationControl> {
    const { data, error } = await this.client.from('whatsapp_ai_conversations')
      .select('clinic_id,id,control_mode,active_handoff_id,assigned_user_id,ai_failure_count,control_revision')
      .eq('clinic_id', context.clinicId).eq('id', context.conversationId).maybeSingle();
    if (error || !data) throw new AiValidationError('AI conversation control could not be loaded.', error);
    const row = data as unknown as Record<string, unknown>;
    return {
      clinicId: String(row.clinic_id), conversationId: String(row.id),
      mode: String(row.control_mode || 'ai_active') as AiConversationControl['mode'],
      activeHandoffId: row.active_handoff_id ? String(row.active_handoff_id) : undefined,
      assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : undefined,
      failureCount: Number(row.ai_failure_count || 0), revision: Number(row.control_revision || 0),
    };
  }

  async request(request: AiHandoffRequest): Promise<AiHandoffRecord | null> {
    return this.call('request_ai_conversation_handoff', {
      p_clinic_id: request.context.clinicId, p_conversation_id: request.context.conversationId,
      p_reason: request.reason, p_priority: request.priority, p_source: request.source,
      p_correlation_id: request.context.correlationId, p_summary: request.summary,
      p_description: request.description || null,
    });
  }

  async recordOperationalFailure(context: AiExecutionContext, reason: AiHandoffReason, threshold: number) {
    return this.call('record_ai_conversation_failure', {
      p_clinic_id: context.clinicId, p_conversation_id: context.conversationId,
      p_correlation_id: context.correlationId, p_reason: reason, p_threshold: threshold,
    });
  }

  async resetOperationalFailures(context: AiExecutionContext) {
    if (!this.client.rpc) throw new AiValidationError('AI handoff RPC is unavailable.');
    const { error } = await this.client.rpc('reset_ai_conversation_failures', {
      p_clinic_id: context.clinicId, p_conversation_id: context.conversationId,
    });
    if (error) throw new AiValidationError('AI failure counter could not be reset.', error);
  }

  private async call(fn: string, args: Record<string, unknown>) {
    if (!this.client.rpc) throw new AiValidationError('AI handoff RPC is unavailable.');
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw new AiValidationError('AI handoff persistence failed.', error);
    const row = (Array.isArray(data) ? data[0] : data) as HandoffRow | null;
    return row ? mapHandoff(row) : null;
  }
}

export class SupabaseAiConversationControlGuard implements AiConversationControlGuard {
  constructor(private readonly repository: SupabaseAiHandoffRepository) {}
  async canExecute(context: AiExecutionContext) {
    try { return (await this.repository.loadControl(context)).mode === 'ai_active'; } catch { return false; }
  }
}

function mapHandoff(row: HandoffRow): AiHandoffRecord {
  return {
    id: row.id, clinicId: row.clinic_id, conversationId: row.conversation_id,
    reason: row.reason, priority: row.priority, source: row.source, status: row.status,
    assignedUserId: row.assigned_user_id || undefined, requestedAt: row.requested_at,
    summary: row.summary,
  };
}
