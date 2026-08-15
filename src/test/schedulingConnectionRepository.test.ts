import { describe, expect, it, vi } from 'vitest';
import {
  SchedulingConnectionRepositoryError,
  SupabaseSchedulingConnectionRepository,
  type SchedulingConnectionSupabaseClientLike,
} from '@/scheduling';

type QueryResult = { data: unknown; error: unknown };

class QueryDouble implements PromiseLike<QueryResult> {
  readonly calls: Array<[string, ...unknown[]]> = [];

  constructor(private readonly result: QueryResult) {}

  select(columns?: string) { return this.record('select', columns); }
  insert(values: unknown) { return this.record('insert', values); }
  update(values: unknown) { return this.record('update', values); }
  eq(column: string, value: unknown) { return this.record('eq', column, value); }
  neq(column: string, value: unknown) { return this.record('neq', column, value); }
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

function ok(data: unknown) {
  return new QueryDouble({ data, error: null });
}

function failure(code: string) {
  return new QueryDouble({ data: null, error: { code, message: 'database error' } });
}

function createClient(tableResults: Record<string, QueryDouble[]>) {
  const from = vi.fn((table: string) => {
    const query = tableResults[table]?.shift();
    if (!query) throw new Error(`Missing query double for ${table}`);
    return query;
  });
  return { client: { from } as SchedulingConnectionSupabaseClientLike, from };
}

const context = { clinicId: 'clinic-a' };
const connectionRow = {
  id: 'connection-1',
  clinic_id: 'clinic-a',
  provider_type: 'google_calendar',
  status: 'active',
  display_name: 'Google Agenda',
  external_account_id: 'account-123',
  external_account_name: 'Conta da clínica',
  source_of_truth: 'external_provider',
  capabilities: { readAvailability: true },
  metadata: { region: 'br' },
  is_default: true,
  connected_at: '2026-08-15T12:00:00.000Z',
  disconnected_at: null,
  last_verified_at: null,
};

const locationMappingRow = {
  id: 'mapping-1',
  clinic_id: 'clinic-a',
  connection_id: 'connection-1',
  location_id: 'location-1',
  external_id: 'calendar/location-1',
  external_parent_id: 'account-123',
  external_name: 'Agenda principal',
  status: 'active',
  metadata: {},
  last_verified_at: null,
};

describe('SupabaseSchedulingConnectionRepository', () => {
  it('lists connections within the explicit tenant and excludes disabled rows by default', async () => {
    const query = ok([connectionRow]);
    const { client } = createClient({ scheduling_provider_connections: [query] });
    const repository = new SupabaseSchedulingConnectionRepository(client);

    await expect(repository.listConnections(context)).resolves.toEqual([
      expect.objectContaining({ id: 'connection-1', providerType: 'google_calendar', isDefault: true }),
    ]);
    expect(query.calls).toEqual(expect.arrayContaining([
      ['eq', 'clinic_id', 'clinic-a'],
      ['neq', 'status', 'disabled'],
      ['order', 'created_at', undefined],
    ]));
  });

  it('loads the clinic default using clinic_id and is_default', async () => {
    const query = ok(connectionRow);
    const { client } = createClient({ scheduling_provider_connections: [query] });
    const repository = new SupabaseSchedulingConnectionRepository(client);

    await expect(repository.getDefaultConnectionForClinic(context)).resolves.toEqual(
      expect.objectContaining({ id: 'connection-1', sourceOfTruth: 'external_provider' }),
    );
    expect(query.calls).toEqual(expect.arrayContaining([
      ['eq', 'clinic_id', 'clinic-a'], ['eq', 'is_default', true], ['maybeSingle'],
    ]));
  });

  it('prefers an active professional override over the clinic default', async () => {
    const assignment = ok({ connection_id: 'connection-1' });
    const override = ok(connectionRow);
    const { client } = createClient({
      scheduling_connection_professionals: [assignment],
      scheduling_provider_connections: [override],
    });
    const repository = new SupabaseSchedulingConnectionRepository(client);

    await expect(repository.getConnectionForProfessional(context, 'professional-1')).resolves.toEqual(
      expect.objectContaining({ id: 'connection-1' }),
    );
    expect(assignment.calls).toEqual(expect.arrayContaining([
      ['eq', 'clinic_id', 'clinic-a'],
      ['eq', 'professional_id', 'professional-1'],
      ['eq', 'is_active', true],
    ]));
  });

  it('falls back to the clinic default when no professional override exists', async () => {
    const assignment = ok(null);
    const defaultConnection = ok(connectionRow);
    const { client } = createClient({
      scheduling_connection_professionals: [assignment],
      scheduling_provider_connections: [defaultConnection],
    });
    const repository = new SupabaseSchedulingConnectionRepository(client);

    await expect(repository.getConnectionForProfessional(context, 'professional-2')).resolves.toEqual(
      expect.objectContaining({ id: 'connection-1' }),
    );
  });

  it('looks mappings up in both Aura-to-external and external-to-Aura directions', async () => {
    const byAura = ok(locationMappingRow);
    const byExternal = ok(locationMappingRow);
    const { client } = createClient({ scheduling_location_mappings: [byAura, byExternal] });
    const repository = new SupabaseSchedulingConnectionRepository(client);

    await expect(repository.getMappingByAuraEntity(
      context, 'connection-1', 'location', 'location-1',
    )).resolves.toEqual(expect.objectContaining({ auraEntityId: 'location-1', externalId: 'calendar/location-1' }));
    await expect(repository.getMappingByExternalId(
      context, 'connection-1', 'location', 'calendar/location-1',
    )).resolves.toEqual(expect.objectContaining({ auraEntityId: 'location-1', externalId: 'calendar/location-1' }));

    for (const query of [byAura, byExternal]) {
      expect(query.calls).toEqual(expect.arrayContaining([
        ['eq', 'clinic_id', 'clinic-a'], ['eq', 'connection_id', 'connection-1'],
        ['neq', 'status', 'disabled'],
      ]));
    }
  });

  it('updates an existing Aura mapping and can disable it without deleting history', async () => {
    const existing = ok(locationMappingRow);
    const updated = ok({ ...locationMappingRow, external_id: 'calendar/location-2' });
    const disabled = ok({ ...locationMappingRow, status: 'disabled' });
    const { client } = createClient({ scheduling_location_mappings: [existing, updated, disabled] });
    const repository = new SupabaseSchedulingConnectionRepository(client);

    await expect(repository.upsertMapping(context, {
      connectionId: 'connection-1',
      entityType: 'location',
      auraEntityId: 'location-1',
      externalId: 'calendar/location-2',
    })).resolves.toEqual(expect.objectContaining({ externalId: 'calendar/location-2' }));
    expect(updated.calls).toEqual(expect.arrayContaining([
      ['update', expect.objectContaining({ clinic_id: 'clinic-a', location_id: 'location-1' })],
      ['eq', 'clinic_id', 'clinic-a'], ['eq', 'id', 'mapping-1'],
    ]));

    await expect(repository.disableMapping(context, 'mapping-1', 'location')).resolves.toEqual(
      expect.objectContaining({ status: 'disabled' }),
    );
    expect(disabled.calls).toContainEqual(['update', { status: 'disabled' }]);
  });

  it('normalizes duplicate mapping violations and always propagates clinic_id on inserts', async () => {
    const noExisting = ok(null);
    const duplicate = failure('23505');
    const { client } = createClient({ scheduling_service_mappings: [noExisting, duplicate] });
    const repository = new SupabaseSchedulingConnectionRepository(client);

    await expect(repository.upsertMapping(context, {
      connectionId: 'connection-1',
      entityType: 'service',
      auraEntityId: 'service-1',
      externalId: 'external-service-1',
    })).rejects.toEqual(expect.objectContaining<Partial<SchedulingConnectionRepositoryError>>({
      code: 'duplicate_mapping',
    }));
    expect(duplicate.calls).toContainEqual(['insert', expect.objectContaining({
      clinic_id: 'clinic-a', connection_id: 'connection-1', treatment_id: 'service-1',
    })]);
  });
});
