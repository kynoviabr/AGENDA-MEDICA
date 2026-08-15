import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../integrations/supabase/types';
import type { SchedulingContext } from '../domain/inputs';
import type { IsoInstant } from '../domain/time';
import type { SchedulingReconciliationRepository } from './SchedulingReconciliationRepository';
import { SchedulingReconciliationRepositoryError } from './SchedulingReconciliationRepository';
import type {
  RegisterSchedulingProviderEventInput,
  SchedulingProviderEvent,
  SchedulingProviderEventStatus,
  SchedulingReconciliationState,
  SchedulingSyncCheckpoint,
} from './models';

interface SupabaseResult { data: unknown; error: unknown }

interface ReconciliationQuery extends PromiseLike<SupabaseResult> {
  select(columns?: string): ReconciliationQuery;
  insert(values: unknown): ReconciliationQuery;
  update(values: unknown): ReconciliationQuery;
  eq(column: string, value: unknown): ReconciliationQuery;
  maybeSingle(): ReconciliationQuery;
  single(): ReconciliationQuery;
}

export interface SchedulingReconciliationSupabaseClientLike { from(table: string): ReconciliationQuery }
type BrowserSupabaseClient = SupabaseClient<Database>;

type ReconciliationRow = {
  connection_id: string;
  clinic_id: string;
  status: SchedulingReconciliationState['status'];
  checkpoint: string | null;
  sync_token: string | null;
  checkpoint_metadata: SchedulingSyncCheckpoint['metadata'];
  last_started_at: string | null;
  last_completed_at: string | null;
  last_success_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  last_error_at: string | null;
  consecutive_failures: number;
};

type EventRow = {
  id: string;
  clinic_id: string;
  connection_id: string;
  provider_type: SchedulingProviderEvent['providerType'];
  external_event_id: string | null;
  payload_hash: string | null;
  event_type: string;
  external_appointment_id: string | null;
  processing_status: SchedulingProviderEventStatus;
  received_at: string;
  processed_at: string | null;
};

const reconciliationColumns = [
  'connection_id', 'clinic_id', 'status', 'checkpoint', 'sync_token',
  'checkpoint_metadata', 'last_started_at', 'last_completed_at', 'last_success_at',
  'last_error_code', 'last_error_message', 'last_error_at', 'consecutive_failures',
].join(',');

const eventColumns = [
  'id', 'clinic_id', 'connection_id', 'provider_type', 'external_event_id',
  'payload_hash', 'event_type', 'external_appointment_id', 'processing_status',
  'received_at', 'processed_at',
].join(',');

function normalizeError(error: unknown): SchedulingReconciliationRepositoryError {
  const value = error as { code?: string } | null;
  if (value?.code === '23505') {
    return new SchedulingReconciliationRepositoryError('duplicate_event', 'Provider event was already registered.', error);
  }
  if (value?.code === '42501') {
    return new SchedulingReconciliationRepositoryError('unauthorized', 'Reconciliation access denied.', error);
  }
  if (value?.code === 'PGRST116') {
    return new SchedulingReconciliationRepositoryError('not_found', 'Reconciliation record was not found.', error);
  }
  return new SchedulingReconciliationRepositoryError('repository_error', 'Reconciliation operation failed.', error);
}

async function unwrap<T>(request: PromiseLike<SupabaseResult>): Promise<T> {
  const { data, error } = await request;
  if (error) throw normalizeError(error);
  return data as T;
}

function mapState(row: ReconciliationRow): SchedulingReconciliationState {
  return {
    clinicId: row.clinic_id,
    connectionId: row.connection_id,
    status: row.status,
    checkpoint: {
      checkpoint: row.checkpoint || undefined,
      syncToken: row.sync_token || undefined,
      metadata: row.checkpoint_metadata || {},
    },
    lastStartedAt: row.last_started_at || undefined,
    lastCompletedAt: row.last_completed_at || undefined,
    lastSuccessAt: row.last_success_at || undefined,
    lastError: row.last_error_code && row.last_error_at ? {
      code: row.last_error_code,
      message: row.last_error_message || undefined,
      occurredAt: row.last_error_at,
    } : undefined,
    consecutiveFailures: row.consecutive_failures,
  };
}

function mapEvent(row: EventRow): SchedulingProviderEvent {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    connectionId: row.connection_id,
    providerType: row.provider_type,
    externalEventId: row.external_event_id || undefined,
    payloadHash: row.payload_hash || undefined,
    eventType: row.event_type,
    externalAppointmentId: row.external_appointment_id || undefined,
    status: row.processing_status,
    receivedAt: row.received_at,
    processedAt: row.processed_at || undefined,
  };
}

export class SupabaseSchedulingReconciliationRepository implements SchedulingReconciliationRepository {
  private readonly client: SchedulingReconciliationSupabaseClientLike;

  constructor(client: BrowserSupabaseClient | SchedulingReconciliationSupabaseClientLike) {
    this.client = client as unknown as SchedulingReconciliationSupabaseClientLike;
  }

  async getState(context: SchedulingContext, connectionId: string) {
    const row = await unwrap<ReconciliationRow | null>(this.client.from('scheduling_reconciliation_states')
      .select(reconciliationColumns)
      .eq('clinic_id', context.clinicId)
      .eq('connection_id', connectionId)
      .maybeSingle());
    return row ? mapState(row) : null;
  }

  async start(context: SchedulingContext, connectionId: string, startedAt: IsoInstant) {
    const existing = await this.getState(context, connectionId);
    const values = {
      clinic_id: context.clinicId,
      connection_id: connectionId,
      status: 'running',
      last_started_at: startedAt,
      last_completed_at: null,
    };
    const request = existing
      ? this.client.from('scheduling_reconciliation_states').update(values)
        .eq('clinic_id', context.clinicId).eq('connection_id', connectionId)
      : this.client.from('scheduling_reconciliation_states').insert(values);
    return mapState(await unwrap<ReconciliationRow>(request.select(reconciliationColumns).single()));
  }

  complete(
    context: SchedulingContext,
    connectionId: string,
    completedAt: IsoInstant,
    checkpoint: SchedulingSyncCheckpoint,
  ) {
    return this.updateState(context, connectionId, {
      status: 'idle', checkpoint: checkpoint.checkpoint || null,
      sync_token: checkpoint.syncToken || null, checkpoint_metadata: checkpoint.metadata,
      last_completed_at: completedAt, last_success_at: completedAt,
      last_error_code: null, last_error_message: null, last_error_at: null,
      consecutive_failures: 0,
    });
  }

  async fail(
    context: SchedulingContext,
    connectionId: string,
    failedAt: IsoInstant,
    error: { code: string; message?: string },
  ) {
    const current = await this.getState(context, connectionId);
    return this.updateState(context, connectionId, {
      status: 'error', last_completed_at: failedAt,
      last_error_code: error.code, last_error_message: error.message || null,
      last_error_at: failedAt, consecutive_failures: (current?.consecutiveFailures || 0) + 1,
    });
  }

  async registerProviderEvent(context: SchedulingContext, input: RegisterSchedulingProviderEventInput) {
    const row = await unwrap<EventRow>(this.client.from('scheduling_provider_events').insert({
      clinic_id: context.clinicId,
      connection_id: input.connectionId,
      provider_type: input.providerType,
      external_event_id: input.externalEventId || null,
      payload_hash: input.payloadHash || null,
      event_type: input.eventType,
      external_appointment_id: input.externalAppointmentId || null,
    }).select(eventColumns).single());
    return mapEvent(row);
  }

  async markProviderEvent(
    context: SchedulingContext,
    eventId: string,
    status: Exclude<SchedulingProviderEventStatus, 'pending'>,
    processedAt: IsoInstant,
    error?: { code: string; message?: string },
  ) {
    const row = await unwrap<EventRow>(this.client.from('scheduling_provider_events').update({
      processing_status: status,
      processed_at: processedAt,
      error_code: error?.code || null,
      error_message: error?.message || null,
    }).eq('clinic_id', context.clinicId).eq('id', eventId).select(eventColumns).single());
    return mapEvent(row);
  }

  private async updateState(context: SchedulingContext, connectionId: string, values: Record<string, unknown>) {
    const row = await unwrap<ReconciliationRow>(this.client.from('scheduling_reconciliation_states')
      .update(values)
      .eq('clinic_id', context.clinicId)
      .eq('connection_id', connectionId)
      .select(reconciliationColumns)
      .single());
    return mapState(row);
  }
}
