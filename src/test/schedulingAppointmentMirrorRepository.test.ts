import { describe, expect, it, vi } from 'vitest';
import {
  SchedulingMirrorRepositoryError,
  SupabaseSchedulingAppointmentMirrorRepository,
  canWriteSchedulingAppointmentLocally,
  type SchedulingMirrorSupabaseClientLike,
} from '@/scheduling';

type QueryResult = { data: unknown; error: unknown };

class QueryDouble implements PromiseLike<QueryResult> {
  readonly calls: Array<[string, ...unknown[]]> = [];
  constructor(private readonly result: QueryResult) {}
  select(columns?: string) { return this.record('select', columns); }
  insert(values: unknown) { return this.record('insert', values); }
  update(values: unknown) { return this.record('update', values); }
  eq(column: string, value: unknown) { return this.record('eq', column, value); }
  in(column: string, values: readonly unknown[]) { return this.record('in', column, values); }
  lt(column: string, value: unknown) { return this.record('lt', column, value); }
  order(column: string, options?: { ascending?: boolean }) { return this.record('order', column, options); }
  maybeSingle() { return this.record('maybeSingle'); }
  single() { return this.record('single'); }
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
  private record(method: string, ...args: unknown[]): this {
    this.calls.push([method, ...args]);
    return this;
  }
}

const ok = (data: unknown) => new QueryDouble({ data, error: null });
const failure = (code: string, message = 'database error') => new QueryDouble({ data: null, error: { code, message } });

function createClient(queries: QueryDouble[]) {
  const from = vi.fn(() => {
    const query = queries.shift();
    if (!query) throw new Error('Missing query double');
    return query;
  });
  return { client: { from } as SchedulingMirrorSupabaseClientLike, from };
}

const context = { clinicId: 'clinic-a' };
const mirrorRow = {
  id: 'appointment-1', clinic_id: 'clinic-a', location_id: null, professional_id: null,
  patient_id: null, lead_id: null, treatment_id: null, health_insurance_id: null,
  billing_type: 'private', appointment_type: 'consultation',
  start_time: '2026-08-17T12:00:00.000Z', end_time: '2026-08-17T13:00:00.000Z', duration_minutes: 60,
  status: 'scheduled', confirmed_at: null, notes: null, cancelled_reason: null, no_show_reason: null,
  rescheduled_from: null, rescheduled_to: null, provider_type: 'doctoralia', connection_id: 'connection-1',
  external_appointment_id: 'external-1', source_of_truth: 'external_provider', sync_state: 'conflict',
  event_origin: 'reconciliation', raw_provider_status: 'booked', external_version: '7', external_etag: 'etag-7',
  last_synced_at: '2026-08-15T10:00:00.000Z', last_provider_seen_at: '2026-08-15T10:00:00.000Z',
  is_tombstone: false, tombstoned_at: null, unmapped_entity_types: ['professional'],
  last_sync_error_code: null, last_sync_error_message: null, last_sync_error_at: null,
  sync_conflict_code: 'UNMAPPED_PROFESSIONAL', sync_conflict_at: '2026-08-15T10:00:00.000Z',
};

const input = {
  connectionId: 'connection-1', providerType: 'doctoralia' as const, externalAppointmentId: 'external-1',
  sourceOfTruth: 'external_provider' as const, syncState: 'conflict' as const, eventOrigin: 'reconciliation' as const,
  startAt: mirrorRow.start_time, endAt: mirrorRow.end_time, durationMinutes: 60,
  status: 'scheduled' as const, confirmationStatus: 'pending' as const,
  appointmentType: 'consultation' as const, billingType: 'private' as const,
  rawProviderStatus: 'booked', externalVersion: '7', externalEtag: 'etag-7',
  unmappedEntityTypes: ['professional'] as const,
  syncConflict: { code: 'UNMAPPED_PROFESSIONAL', occurredAt: '2026-08-15T10:00:00.000Z' },
};

describe('SupabaseSchedulingAppointmentMirrorRepository', () => {
  it('maps external identity, provider metadata, unmapped entities, and conflict state', async () => {
    const query = ok(mirrorRow);
    const { client } = createClient([query]);
    const repository = new SupabaseSchedulingAppointmentMirrorRepository(client);

    await expect(repository.getByExternalId(context, 'connection-1', 'external-1')).resolves.toEqual(
      expect.objectContaining({
        provider: 'doctoralia', connectionId: 'connection-1', externalId: 'external-1',
        externalVersion: '7', externalEtag: 'etag-7', unmappedEntityTypes: ['professional'],
        syncConflict: { code: 'UNMAPPED_PROFESSIONAL', occurredAt: '2026-08-15T10:00:00.000Z' },
      }),
    );
    expect(query.calls).toEqual(expect.arrayContaining([
      ['eq', 'clinic_id', 'clinic-a'], ['eq', 'connection_id', 'connection-1'],
      ['eq', 'external_appointment_id', 'external-1'],
    ]));
  });

  it('inserts a partial external mirror without inventing Aura entities', async () => {
    const lookup = ok(null);
    const insert = ok(mirrorRow);
    const { client } = createClient([lookup, insert]);
    const repository = new SupabaseSchedulingAppointmentMirrorRepository(client);

    await repository.upsertExternalMirror(context, input);
    expect(insert.calls).toContainEqual(['insert', expect.objectContaining({
      clinic_id: 'clinic-a', connection_id: 'connection-1', professional_id: null,
      external_appointment_id: 'external-1', unmapped_entity_types: ['professional'],
    })]);
  });

  it('updates an existing mirror and preserves tenant scoping', async () => {
    const lookup = ok(mirrorRow);
    const update = ok({ ...mirrorRow, external_version: '8' });
    const { client } = createClient([lookup, update]);
    const repository = new SupabaseSchedulingAppointmentMirrorRepository(client);

    await repository.upsertExternalMirror(context, { ...input, externalVersion: '8' });
    expect(update.calls).toEqual(expect.arrayContaining([
      ['update', expect.objectContaining({ external_version: '8' })],
      ['eq', 'clinic_id', 'clinic-a'], ['eq', 'id', 'appointment-1'],
    ]));
  });

  it('normalizes duplicate identities and provider-authority write failures', async () => {
    const duplicateRepository = new SupabaseSchedulingAppointmentMirrorRepository(
      createClient([ok(null), failure('23505')]).client,
    );
    await expect(duplicateRepository.upsertExternalMirror(context, input)).rejects.toEqual(
      expect.objectContaining<Partial<SchedulingMirrorRepositoryError>>({ code: 'duplicate_external_appointment' }),
    );

    const authorityRepository = new SupabaseSchedulingAppointmentMirrorRepository(
      createClient([failure('P0001', 'AGENDA_PROVIDER_WRITE_REQUIRED')]).client,
    );
    await expect(authorityRepository.markError(context, 'appointment-1', {
      code: 'FAILED', occurredAt: '2026-08-15T11:00:00.000Z',
    })).rejects.toEqual(expect.objectContaining<Partial<SchedulingMirrorRepositoryError>>({ code: 'provider_write_required' }));
  });

  it('supports sync, conflict, error, tombstone, pending, and stale metadata operations', async () => {
    const synced = ok({ ...mirrorRow, sync_state: 'synced', unmapped_entity_types: [], sync_conflict_code: null, sync_conflict_at: null });
    const conflict = ok(mirrorRow);
    const errored = ok({ ...mirrorRow, sync_state: 'error', last_sync_error_code: 'TIMEOUT', last_sync_error_at: '2026-08-15T11:00:00.000Z' });
    const tombstone = ok({ ...mirrorRow, sync_state: 'tombstoned', is_tombstone: true, tombstoned_at: '2026-08-15T12:00:00.000Z' });
    const pending = ok([{ ...mirrorRow, sync_state: 'pending_update' }]);
    const stale = ok([{ ...mirrorRow, sync_state: 'stale' }]);
    const { client } = createClient([synced, conflict, errored, tombstone, pending, stale]);
    const repository = new SupabaseSchedulingAppointmentMirrorRepository(client);

    await expect(repository.markSynced(context, 'appointment-1', '2026-08-15T11:00:00.000Z')).resolves.toEqual(expect.objectContaining({ syncState: 'synced' }));
    await repository.markConflict(context, 'appointment-1', { code: 'UNMAPPED_PROFESSIONAL', occurredAt: '2026-08-15T10:00:00.000Z' });
    await repository.markError(context, 'appointment-1', { code: 'TIMEOUT', occurredAt: '2026-08-15T11:00:00.000Z' });
    await expect(repository.tombstone(context, 'appointment-1', '2026-08-15T12:00:00.000Z')).resolves.toEqual(
      expect.objectContaining({ isTombstone: true, syncState: 'tombstoned' }),
    );
    await expect(repository.listPending(context, 'connection-1')).resolves.toHaveLength(1);
    await expect(repository.listStale(context, 'connection-1', '2026-08-15T12:00:00.000Z')).resolves.toHaveLength(1);
    expect(pending.calls).toContainEqual(['in', 'sync_state', ['pending_create', 'pending_update', 'pending_cancel']]);
    expect(stale.calls).toContainEqual(['lt', 'last_provider_seen_at', '2026-08-15T12:00:00.000Z']);
  });

  it('makes local versus provider write authority explicit', () => {
    expect(canWriteSchedulingAppointmentLocally({ sourceOfTruth: 'aura' })).toBe(true);
    expect(canWriteSchedulingAppointmentLocally({ sourceOfTruth: 'external_provider' })).toBe(false);
  });
});
