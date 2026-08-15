import type { AiClinicConfig, AiConversationMessage, AiExecutionContext } from '../../domain/models.ts';
import {
  createEmptyConversationState,
  type AiConversationState,
  type AiConversationStateRepository,
  type AiPersistedConversationState,
} from '../../domain/conversation.ts';
import { AiValidationError } from '../../errors/AiError.ts';
import type { AiClinicConfigLoader, AiConversationHistoryLoader } from '../../services/AuraAiOrchestrator.ts';
import type { AiUsageEvent, AiUsageRecorder } from '../../usage/AiUsageRecorder.ts';

interface QueryResult { data: unknown; error: { message?: string } | null }
interface AiQuery extends PromiseLike<QueryResult> {
  select(columns?: string): AiQuery;
  insert(values: unknown): AiQuery;
  eq(column: string, value: unknown): AiQuery;
  order(column: string, options?: { ascending?: boolean }): AiQuery;
  limit(value: number): AiQuery;
  maybeSingle(): AiQuery;
}
export interface AiSupabaseClientLike {
  from(table: string): AiQuery;
  rpc?(fn: string, args: Record<string, unknown>): PromiseLike<QueryResult>;
}

async function unwrap<T>(query: PromiseLike<QueryResult>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new AiValidationError('AI persistence operation failed.', error);
  return data as T;
}

export class SupabaseAiClinicConfigLoader implements AiClinicConfigLoader {
  constructor(private readonly client: AiSupabaseClientLike) {}
  async load(context: AiExecutionContext): Promise<AiClinicConfig> {
    const [clinic, settings, location] = await Promise.all([
      unwrap<{ id: string; name: string } | null>(this.client.from('clinics')
        .select('id,name').eq('id', context.clinicId).maybeSingle()),
      unwrap<{ is_enabled: boolean; preferred_language: string | null; response_style: string | null } | null>(
        this.client.from('whatsapp_ai_settings')
          .select('is_enabled,preferred_language,response_style').eq('clinic_id', context.clinicId).maybeSingle(),
      ),
      unwrap<{ timezone: string } | null>(this.client.from('clinic_locations')
        .select('timezone').eq('clinic_id', context.clinicId).eq('active', true)
        .order('is_default', { ascending: false }).limit(1).maybeSingle()),
    ]);
    if (!clinic) throw new AiValidationError('Clinic not found for AI execution.');
    return {
      clinicId: clinic.id, clinicName: clinic.name, enabled: settings?.is_enabled !== false,
      preferredLanguage: settings?.preferred_language || 'pt-BR',
      responseStyle: settings?.response_style || 'curta, profissional e acolhedora',
      timezone: location?.timezone || 'America/Sao_Paulo',
    };
  }
}

export class SupabaseAiConversationStateRepository implements AiConversationStateRepository {
  constructor(private readonly client: AiSupabaseClientLike) {}

  async load(clinicId: string, conversationId: string): Promise<AiPersistedConversationState> {
    const row = await unwrap<{ conversation_state: AiConversationState | null; state_revision: number } | null>(
      this.client.from('whatsapp_ai_conversations').select('conversation_state,state_revision')
        .eq('clinic_id', clinicId).eq('id', conversationId).maybeSingle(),
    );
    if (!row) throw new AiValidationError('Conversation state not found for AI execution.');
    return { state: row.conversation_state || createEmptyConversationState(), revision: row.state_revision };
  }

  async saveIfRevision(
    clinicId: string,
    conversationId: string,
    expectedRevision: number,
    state: AiConversationState,
  ): Promise<AiPersistedConversationState | null> {
    if (!this.client.rpc) throw new AiValidationError('Atomic conversation state RPC is unavailable.');
    const { data, error } = await this.client.rpc('update_whatsapp_ai_conversation_state', {
      p_clinic_id: clinicId,
      p_conversation_id: conversationId,
      p_expected_revision: expectedRevision,
      p_state: state,
    });
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === '40001') return null;
      throw new AiValidationError('Conversation state persistence failed.', error);
    }
    const result = data as { state: AiConversationState; revision: number } | null;
    return result ? { state: result.state, revision: result.revision } : null;
  }
}

export class SupabaseAiConversationHistoryLoader implements AiConversationHistoryLoader {
  constructor(private readonly client: AiSupabaseClientLike) {}
  async loadRecent(context: AiExecutionContext, limit: number): Promise<readonly AiConversationMessage[]> {
    const rows = await unwrap<Array<{ clinic_id: string; conversation_id: string; role: string; body: string }>>(
      this.client.from('whatsapp_ai_messages').select('clinic_id,conversation_id,role,body')
        .eq('clinic_id', context.clinicId).eq('conversation_id', context.conversationId)
        .order('created_at', { ascending: false }).limit(limit),
    );
    return rows.reverse().filter((row) => row.role === 'user' || row.role === 'assistant').map((row) => ({
      clinicId: row.clinic_id, conversationId: row.conversation_id,
      role: row.role as 'user' | 'assistant', text: row.body,
    }));
  }
}

export class SupabaseAiUsageRecorder implements AiUsageRecorder {
  constructor(private readonly client: AiSupabaseClientLike) {}
  async record(event: AiUsageEvent): Promise<void> {
    await unwrap(this.client.from('ai_usage_events').insert({
      clinic_id: event.context.clinicId,
      conversation_id: event.context.conversationId,
      correlation_id: event.context.correlationId,
      channel: event.context.channel,
      message_type: event.messageType,
      request_type: event.requestType,
      provider: event.provider,
      model: event.model || null,
      input_units: event.inputUnits ?? null,
      output_units: event.outputUnits ?? null,
      total_units: event.totalUnits ?? null,
      preprocessing_latency_ms: event.preprocessingLatencyMs ?? null,
      provider_latency_ms: event.providerLatencyMs ?? null,
      total_latency_ms: event.totalLatencyMs,
      outcome: event.outcome,
      error_code: event.errorCode || null,
      occurred_at: event.occurredAt,
    }));
  }
}
