import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../integrations/supabase/types.ts';
import type { SchedulingContext } from '../domain/inputs.ts';
import type { SchedulingAppointmentStatus, SchedulingConfirmationStatus } from '../domain/models.ts';
import type { IsoInstant } from '../domain/time.ts';
import {
  mapInternalAppointmentStatus,
  mapInternalAppointmentType,
  mapInternalBillingType,
} from '../providers/internal/internalSchedulingMappers.ts';
import type { InternalAppointmentStatus } from '../providers/internal/InternalSchedulingDataSource.ts';
import type { SchedulingAppointmentMirrorRepository } from './SchedulingAppointmentMirrorRepository.ts';
import { SchedulingMirrorRepositoryError } from './SchedulingAppointmentMirrorRepository.ts';
import type {
  SchedulingAppointmentMirror,
  SchedulingSyncConflict,
  SchedulingSyncError,
  UpsertExternalAppointmentMirrorInput,
} from './models.ts';

interface SupabaseResult { data: unknown; error: unknown }

interface MirrorQuery extends PromiseLike<SupabaseResult> {
  select(columns?: string): MirrorQuery;
  insert(values: unknown): MirrorQuery;
  update(values: unknown): MirrorQuery;
  eq(column: string, value: unknown): MirrorQuery;
  in(column: string, values: readonly unknown[]): MirrorQuery;
  lt(column: string, value: unknown): MirrorQuery;
  order(column: string, options?: { ascending?: boolean }): MirrorQuery;
  maybeSingle(): MirrorQuery;
  single(): MirrorQuery;
}

export interface SchedulingMirrorSupabaseClientLike { from(table: string): MirrorQuery }
type BrowserSupabaseClient = SupabaseClient<Database>;

type MirrorRow = {
  id: string;
  clinic_id: string;
  location_id: string | null;
  professional_id: string | null;
  patient_id: string | null;
  lead_id: string | null;
  treatment_id: string | null;
  health_insurance_id: string | null;
  billing_type: string;
  appointment_type: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: InternalAppointmentStatus;
  confirmed_at: string | null;
  notes: string | null;
  cancelled_reason: string | null;
  no_show_reason: string | null;
  rescheduled_from: string | null;
  rescheduled_to: string | null;
  provider_type: SchedulingAppointmentMirror['provider'];
  connection_id: string | null;
  external_appointment_id: string | null;
  source_of_truth: SchedulingAppointmentMirror['sourceOfTruth'];
  sync_state: SchedulingAppointmentMirror['syncState'];
  event_origin: SchedulingAppointmentMirror['eventOrigin'];
  raw_provider_status: string | null;
  external_version: string | null;
  external_etag: string | null;
  last_synced_at: string | null;
  last_provider_seen_at: string | null;
  is_tombstone: boolean;
  tombstoned_at: string | null;
  unmapped_entity_types: SchedulingAppointmentMirror['unmappedEntityTypes'];
  last_sync_error_code: string | null;
  last_sync_error_message: string | null;
  last_sync_error_at: string | null;
  sync_conflict_code: string | null;
  sync_conflict_at: string | null;
};

const mirrorColumns = [
  'id', 'clinic_id', 'location_id', 'professional_id', 'patient_id', 'lead_id',
  'treatment_id', 'health_insurance_id', 'billing_type', 'appointment_type',
  'start_time', 'end_time', 'duration_minutes', 'status', 'confirmed_at', 'notes',
  'cancelled_reason', 'no_show_reason', 'rescheduled_from', 'rescheduled_to',
  'provider_type', 'connection_id', 'external_appointment_id', 'source_of_truth',
  'sync_state', 'event_origin', 'raw_provider_status', 'external_version',
  'external_etag', 'last_synced_at', 'last_provider_seen_at', 'is_tombstone',
  'tombstoned_at', 'unmapped_entity_types', 'last_sync_error_code',
  'last_sync_error_message', 'last_sync_error_at', 'sync_conflict_code', 'sync_conflict_at',
].join(',');

function normalizeError(error: unknown): SchedulingMirrorRepositoryError {
  const value = error as { code?: string; message?: string } | null;
  if (value?.code === '23505') {
    return new SchedulingMirrorRepositoryError(
      'duplicate_external_appointment',
      'This external appointment already exists for the scheduling connection.',
      error,
    );
  }
  if (value?.message?.includes('AGENDA_PROVIDER_WRITE_REQUIRED')) {
    return new SchedulingMirrorRepositoryError('provider_write_required', 'The provider must authorize this appointment change.', error);
  }
  if (value?.code === '42501') {
    return new SchedulingMirrorRepositoryError('unauthorized', 'Appointment mirror access denied.', error);
  }
  if (value?.code === 'PGRST116') {
    return new SchedulingMirrorRepositoryError('not_found', 'Appointment mirror was not found.', error);
  }
  return new SchedulingMirrorRepositoryError('repository_error', 'Appointment mirror operation failed.', error);
}

async function unwrap<T>(request: PromiseLike<SupabaseResult>): Promise<T> {
  const { data, error } = await request;
  if (error) throw normalizeError(error);
  return data as T;
}

function toSqlStatus(status: SchedulingAppointmentStatus, confirmation: SchedulingConfirmationStatus): InternalAppointmentStatus {
  if (status === 'scheduled' && confirmation === 'confirmed') return 'confirmed';
  return status;
}

function mapMirror(row: MirrorRow): SchedulingAppointmentMirror {
  const normalizedStatus = mapInternalAppointmentStatus(row.status, row.confirmed_at);
  return {
    id: row.id,
    provider: row.provider_type,
    connectionId: row.connection_id || undefined,
    externalId: row.external_appointment_id || undefined,
    sourceOfTruth: row.source_of_truth,
    syncState: row.sync_state,
    eventOrigin: row.event_origin,
    locationId: row.location_id || undefined,
    professionalId: row.professional_id || undefined,
    patientId: row.patient_id || undefined,
    leadId: row.lead_id || undefined,
    serviceId: row.treatment_id || undefined,
    insuranceId: row.health_insurance_id || undefined,
    billingType: mapInternalBillingType(row.billing_type),
    appointmentType: mapInternalAppointmentType(row.appointment_type),
    startAt: row.start_time,
    endAt: row.end_time,
    durationMinutes: row.duration_minutes,
    status: normalizedStatus.status,
    confirmationStatus: normalizedStatus.confirmationStatus,
    rawProviderStatus: row.raw_provider_status || undefined,
    notes: row.notes || undefined,
    cancellationReason: (row.status === 'no_show' ? row.no_show_reason : row.cancelled_reason) || undefined,
    rescheduledFromId: row.rescheduled_from || undefined,
    rescheduledToId: row.rescheduled_to || undefined,
    confirmedAt: row.confirmed_at || undefined,
    externalVersion: row.external_version || undefined,
    externalEtag: row.external_etag || undefined,
    lastSyncedAt: row.last_synced_at || undefined,
    lastProviderSeenAt: row.last_provider_seen_at || undefined,
    isTombstone: row.is_tombstone,
    tombstonedAt: row.tombstoned_at || undefined,
    unmappedEntityTypes: row.unmapped_entity_types || [],
    syncError: row.last_sync_error_code && row.last_sync_error_at ? {
      code: row.last_sync_error_code,
      message: row.last_sync_error_message || undefined,
      occurredAt: row.last_sync_error_at,
    } : undefined,
    syncConflict: row.sync_conflict_code && row.sync_conflict_at ? {
      code: row.sync_conflict_code,
      occurredAt: row.sync_conflict_at,
    } : undefined,
  };
}

export class SupabaseSchedulingAppointmentMirrorRepository implements SchedulingAppointmentMirrorRepository {
  private readonly client: SchedulingMirrorSupabaseClientLike;

  constructor(client: BrowserSupabaseClient | SchedulingMirrorSupabaseClientLike) {
    this.client = client as unknown as SchedulingMirrorSupabaseClientLike;
  }

  async getByExternalId(context: SchedulingContext, connectionId: string, externalAppointmentId: string) {
    const row = await unwrap<MirrorRow | null>(this.client.from('appointments')
      .select(mirrorColumns)
      .eq('clinic_id', context.clinicId)
      .eq('connection_id', connectionId)
      .eq('external_appointment_id', externalAppointmentId)
      .maybeSingle());
    return row ? mapMirror(row) : null;
  }

  async upsertExternalMirror(context: SchedulingContext, input: UpsertExternalAppointmentMirrorInput) {
    const existing = await this.getByExternalId(context, input.connectionId, input.externalAppointmentId);
    const values = {
      clinic_id: context.clinicId,
      connection_id: input.connectionId,
      provider_type: input.providerType,
      external_appointment_id: input.externalAppointmentId,
      source_of_truth: input.sourceOfTruth,
      sync_state: input.syncState,
      event_origin: input.eventOrigin,
      location_id: input.locationId || null,
      professional_id: input.professionalId || null,
      patient_id: input.patientId || null,
      lead_id: input.leadId || null,
      treatment_id: input.serviceId || null,
      health_insurance_id: input.insuranceId || null,
      billing_type: input.billingType,
      appointment_type: input.appointmentType,
      start_time: input.startAt,
      end_time: input.endAt,
      duration_minutes: input.durationMinutes,
      status: toSqlStatus(input.status, input.confirmationStatus),
      confirmed_at: input.confirmedAt || null,
      notes: input.notes || null,
      raw_provider_status: input.rawProviderStatus || null,
      external_version: input.externalVersion || null,
      external_etag: input.externalEtag || null,
      last_synced_at: input.lastSyncedAt || null,
      last_provider_seen_at: input.lastProviderSeenAt || null,
      unmapped_entity_types: input.unmappedEntityTypes || [],
      sync_conflict_code: input.syncConflict?.code || null,
      sync_conflict_at: input.syncConflict?.occurredAt || null,
      is_tombstone: false,
      tombstoned_at: null,
    };
    const request = existing
      ? this.client.from('appointments').update(values).eq('clinic_id', context.clinicId).eq('id', existing.id)
      : this.client.from('appointments').insert(values);
    return mapMirror(await unwrap<MirrorRow>(request.select(mirrorColumns).single()));
  }

  markSynced(context: SchedulingContext, appointmentId: string, syncedAt: IsoInstant, providerSeenAt = syncedAt) {
    return this.updateMirror(context, appointmentId, {
      sync_state: 'synced', last_synced_at: syncedAt, last_provider_seen_at: providerSeenAt,
      last_sync_error_code: null, last_sync_error_message: null, last_sync_error_at: null,
      sync_conflict_code: null, sync_conflict_at: null, unmapped_entity_types: [],
    });
  }

  markConflict(context: SchedulingContext, appointmentId: string, conflict: SchedulingSyncConflict) {
    return this.updateMirror(context, appointmentId, {
      sync_state: 'conflict', sync_conflict_code: conflict.code, sync_conflict_at: conflict.occurredAt,
    });
  }

  markError(context: SchedulingContext, appointmentId: string, error: SchedulingSyncError) {
    return this.updateMirror(context, appointmentId, {
      sync_state: 'error', last_sync_error_code: error.code,
      last_sync_error_message: error.message || null, last_sync_error_at: error.occurredAt,
    });
  }

  tombstone(context: SchedulingContext, appointmentId: string, tombstonedAt: IsoInstant) {
    return this.updateMirror(context, appointmentId, {
      sync_state: 'tombstoned', is_tombstone: true, tombstoned_at: tombstonedAt,
    });
  }

  async listPending(context: SchedulingContext, connectionId: string) {
    const rows = await unwrap<MirrorRow[]>(this.client.from('appointments')
      .select(mirrorColumns)
      .eq('clinic_id', context.clinicId)
      .eq('connection_id', connectionId)
      .in('sync_state', ['pending_create', 'pending_update', 'pending_cancel'])
      .order('updated_at'));
    return rows.map(mapMirror);
  }

  async listStale(context: SchedulingContext, connectionId: string, providerSeenBefore: IsoInstant) {
    const rows = await unwrap<MirrorRow[]>(this.client.from('appointments')
      .select(mirrorColumns)
      .eq('clinic_id', context.clinicId)
      .eq('connection_id', connectionId)
      .eq('source_of_truth', 'external_provider')
      .eq('is_tombstone', false)
      .lt('last_provider_seen_at', providerSeenBefore)
      .order('last_provider_seen_at'));
    return rows.map(mapMirror);
  }

  private async updateMirror(context: SchedulingContext, appointmentId: string, values: Record<string, unknown>) {
    const row = await unwrap<MirrorRow>(this.client.from('appointments')
      .update(values)
      .eq('clinic_id', context.clinicId)
      .eq('id', appointmentId)
      .select(mirrorColumns)
      .single());
    return mapMirror(row);
  }
}
