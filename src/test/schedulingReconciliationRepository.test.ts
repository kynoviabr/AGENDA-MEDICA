import { describe, expect, it, vi } from 'vitest';
import {
  SchedulingReconciliationRepositoryError,
  SupabaseSchedulingReconciliationRepository,
  type SchedulingReconciliationSupabaseClientLike,
} from '@/scheduling';

type QueryResult = { data: unknown; error: unknown };

class QueryDouble implements PromiseLike<QueryResult> {
  readonly calls: Array<[string, ...unknown[]]> = [];
  constructor(private readonly result: QueryResult) {}
  select(columns?: string) { return this.record('select', columns); }
  insert(values: unknown) { return this.record('insert', values); }
  update(values: unknown) { return this.record('update', values); }
  eq(column: string, value: unknown) { return this.record('eq', column, value); }
  maybeSingle() { return this.record('maybeSingle'); }
  single() { return this.record('single'); }
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
  private record(method: string, ...args: unknown[]): this { this.calls.push([method, ...args]); return this; }
}

const ok = (data: unknown) => new QueryDouble({ data, error: null });
const failure = (code: string) => new QueryDouble({ data: null, error: { code, message: 'database error' } });

function createClient(tableResults: Record<string, QueryDouble[]>) {
  const from = vi.fn((table: string) => {
    const query = tableResults[table]?.shift();
    if (!query) throw new Error(`Missing query double for ${table}`);
    return query;
  });
  return { client: { from } as SchedulingReconciliationSupabaseClientLike, from };
}

const context = { clinicId: 'clinic-a' };
const stateRow = {
  connection_id: 'connection-1', clinic_id: 'clinic-a', status: 'idle', checkpoint: 'cursor-7', sync_token: 'token-7',
  checkpoint_metadata: { page: 7 }, last_started_at: '2026-08-15T10:00:00.000Z',
  last_completed_at: '2026-08-15T10:05:00.000Z', last_success_at: '2026-08-15T10:05:00.000Z',
  last_error_code: null, last_error_message: null, last_error_at: null, consecutive_failures: 0,
};
const eventRow = {
  id: 'event-1', clinic_id: 'clinic-a', connection_id: 'connection-1', provider_type: 'doctoralia',
  external_event_id: 'provider-event-1', payload_hash: null, event_type: 'appointment.updated',
  external_appointment_id: 'external-1', processing_status: 'pending', received_at: '2026-08-15T10:00:00.000Z', processed_at: null,
};

describe('SupabaseSchedulingReconciliationRepository', () => {
  it('loads reconciliation state inside the clinic boundary and maps its checkpoint', async () => {
    const query = ok(stateRow);
    const repository = new SupabaseSchedulingReconciliationRepository(createClient({ scheduling_reconciliation_states: [query] }).client);
    await expect(repository.getState(context, 'connection-1')).resolves.toEqual(expect.objectContaining({
      clinicId: 'clinic-a', connectionId: 'connection-1', checkpoint: { checkpoint: 'cursor-7', syncToken: 'token-7', metadata: { page: 7 } },
    }));
    expect(query.calls).toEqual(expect.arrayContaining([['eq', 'clinic_id', 'clinic-a'], ['eq', 'connection_id', 'connection-1']]));
  });

  it('starts a new state and completes it with a persisted checkpoint', async () => {
    const missing = ok(null);
    const running = ok({ ...stateRow, status: 'running', last_completed_at: null });
    const completed = ok(stateRow);
    const { client } = createClient({ scheduling_reconciliation_states: [missing, running, completed] });
    const repository = new SupabaseSchedulingReconciliationRepository(client);

    await expect(repository.start(context, 'connection-1', '2026-08-15T10:00:00.000Z')).resolves.toEqual(expect.objectContaining({ status: 'running' }));
    expect(running.calls).toContainEqual(['insert', expect.objectContaining({ clinic_id: 'clinic-a', connection_id: 'connection-1' })]);
    await repository.complete(context, 'connection-1', '2026-08-15T10:05:00.000Z', {
      checkpoint: 'cursor-7', syncToken: 'token-7', metadata: { page: 7 },
    });
    expect(completed.calls).toContainEqual(['update', expect.objectContaining({
      status: 'idle', checkpoint: 'cursor-7', sync_token: 'token-7', consecutive_failures: 0,
    })]);
  });

  it('records sanitized failure metadata and increments consecutive failures', async () => {
    const current = ok({ ...stateRow, status: 'error', consecutive_failures: 2 });
    const failed = ok({ ...stateRow, status: 'error', last_error_code: 'PROVIDER_TIMEOUT', last_error_at: '2026-08-15T11:00:00.000Z', consecutive_failures: 3 });
    const repository = new SupabaseSchedulingReconciliationRepository(createClient({ scheduling_reconciliation_states: [current, failed] }).client);

    await expect(repository.fail(context, 'connection-1', '2026-08-15T11:00:00.000Z', {
      code: 'PROVIDER_TIMEOUT', message: 'Provider unavailable',
    })).resolves.toEqual(expect.objectContaining({ status: 'error', consecutiveFailures: 3 }));
    expect(failed.calls).toContainEqual(['update', expect.objectContaining({
      last_error_code: 'PROVIDER_TIMEOUT', last_error_message: 'Provider unavailable', consecutive_failures: 3,
    })]);
  });

  it('registers and marks provider events with tenant-scoped idempotency metadata', async () => {
    const inserted = ok(eventRow);
    const processed = ok({ ...eventRow, processing_status: 'processed', processed_at: '2026-08-15T10:01:00.000Z' });
    const { client } = createClient({ scheduling_provider_events: [inserted, processed] });
    const repository = new SupabaseSchedulingReconciliationRepository(client);

    await repository.registerProviderEvent(context, {
      connectionId: 'connection-1', providerType: 'doctoralia', externalEventId: 'provider-event-1',
      eventType: 'appointment.updated', externalAppointmentId: 'external-1',
    });
    expect(inserted.calls).toContainEqual(['insert', expect.objectContaining({ clinic_id: 'clinic-a', external_event_id: 'provider-event-1' })]);
    await expect(repository.markProviderEvent(context, 'event-1', 'processed', '2026-08-15T10:01:00.000Z')).resolves.toEqual(
      expect.objectContaining({ status: 'processed', processedAt: '2026-08-15T10:01:00.000Z' }),
    );
    expect(processed.calls).toEqual(expect.arrayContaining([['eq', 'clinic_id', 'clinic-a'], ['eq', 'id', 'event-1']]));
  });

  it('normalizes duplicate provider events', async () => {
    const repository = new SupabaseSchedulingReconciliationRepository(
      createClient({ scheduling_provider_events: [failure('23505')] }).client,
    );
    await expect(repository.registerProviderEvent(context, {
      connectionId: 'connection-1', providerType: 'doctoralia', payloadHash: 'sha256:abc', eventType: 'appointment.updated',
    })).rejects.toEqual(expect.objectContaining<Partial<SchedulingReconciliationRepositoryError>>({ code: 'duplicate_event' }));
  });
});
