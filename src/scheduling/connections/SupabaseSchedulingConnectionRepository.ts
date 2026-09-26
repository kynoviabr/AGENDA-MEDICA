import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../integrations/supabase/types.ts';
import type { SchedulingContext } from '../domain/inputs.ts';
import type {
  ListSchedulingConnectionsInput,
  ListSchedulingMappingsInput,
  SchedulingConnectionRepository,
} from './SchedulingConnectionRepository.ts';
import { SchedulingConnectionRepositoryError } from './SchedulingConnectionRepository.ts';
import type {
  SchedulingConnection,
  SchedulingEntityMapping,
  SchedulingMappedEntityType,
  UpsertSchedulingEntityMappingInput,
} from './models.ts';

interface SupabaseResult {
  data: unknown;
  error: unknown;
}

interface SchedulingConnectionQuery extends PromiseLike<SupabaseResult> {
  select(columns?: string): SchedulingConnectionQuery;
  insert(values: unknown): SchedulingConnectionQuery;
  update(values: unknown): SchedulingConnectionQuery;
  eq(column: string, value: unknown): SchedulingConnectionQuery;
  neq(column: string, value: unknown): SchedulingConnectionQuery;
  order(column: string, options?: { ascending?: boolean }): SchedulingConnectionQuery;
  maybeSingle(): SchedulingConnectionQuery;
  single(): SchedulingConnectionQuery;
}

export interface SchedulingConnectionSupabaseClientLike {
  from(table: string): SchedulingConnectionQuery;
}

type BrowserSupabaseClient = SupabaseClient<Database>;

type ConnectionRow = {
  id: string;
  clinic_id: string;
  provider_type: SchedulingConnection['providerType'];
  status: SchedulingConnection['status'];
  display_name: string;
  external_account_id: string | null;
  external_account_name: string | null;
  source_of_truth: SchedulingConnection['sourceOfTruth'];
  capabilities: SchedulingConnection['capabilities'];
  metadata: SchedulingConnection['metadata'];
  is_default: boolean;
  connected_at: string | null;
  disconnected_at: string | null;
  last_verified_at: string | null;
};

type MappingRow = {
  id: string;
  clinic_id: string;
  connection_id: string;
  external_id: string;
  external_parent_id: string | null;
  external_name: string | null;
  status: SchedulingEntityMapping['status'];
  metadata: SchedulingEntityMapping['metadata'];
  last_verified_at: string | null;
  location_id?: string;
  professional_id?: string;
  treatment_id?: string;
  health_insurance_id?: string;
};

const connectionColumns = [
  'id', 'clinic_id', 'provider_type', 'status', 'display_name',
  'external_account_id', 'external_account_name', 'source_of_truth',
  'capabilities', 'metadata', 'is_default', 'connected_at',
  'disconnected_at', 'last_verified_at',
].join(',');

const mappingConfig = {
  location: { table: 'scheduling_location_mappings', auraColumn: 'location_id' },
  professional: { table: 'scheduling_professional_mappings', auraColumn: 'professional_id' },
  service: { table: 'scheduling_service_mappings', auraColumn: 'treatment_id' },
  insurance: { table: 'scheduling_insurance_mappings', auraColumn: 'health_insurance_id' },
} as const;

function normalizeError(error: unknown): SchedulingConnectionRepositoryError {
  const value = error as { code?: string } | null;
  if (value?.code === '23505') {
    return new SchedulingConnectionRepositoryError(
      'duplicate_mapping',
      'This Aura or external entity already has an active mapping for the connection.',
      error,
    );
  }
  if (value?.code === '42501') {
    return new SchedulingConnectionRepositoryError('unauthorized', 'Scheduling connection access denied.', error);
  }
  if (value?.code === 'PGRST116') {
    return new SchedulingConnectionRepositoryError('not_found', 'Scheduling configuration was not found.', error);
  }
  return new SchedulingConnectionRepositoryError('repository_error', 'Scheduling configuration operation failed.', error);
}

async function unwrap<T>(request: PromiseLike<SupabaseResult>): Promise<T> {
  const { data, error } = await request;
  if (error) throw normalizeError(error);
  return data as T;
}

function mapConnection(row: ConnectionRow): SchedulingConnection {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    providerType: row.provider_type,
    status: row.status,
    displayName: row.display_name,
    externalAccountId: row.external_account_id || undefined,
    externalAccountName: row.external_account_name || undefined,
    sourceOfTruth: row.source_of_truth,
    capabilities: row.capabilities || {},
    metadata: row.metadata || {},
    isDefault: row.is_default,
    connectedAt: row.connected_at || undefined,
    disconnectedAt: row.disconnected_at || undefined,
    lastVerifiedAt: row.last_verified_at || undefined,
  };
}

function mapEntity(row: MappingRow, entityType: SchedulingMappedEntityType): SchedulingEntityMapping {
  const auraColumn = mappingConfig[entityType].auraColumn;
  const auraEntityId = row[auraColumn];
  if (!auraEntityId) {
    throw new SchedulingConnectionRepositoryError('repository_error', 'Mapping is missing its Aura entity identifier.');
  }
  return {
    id: row.id,
    clinicId: row.clinic_id,
    connectionId: row.connection_id,
    entityType,
    auraEntityId,
    externalId: row.external_id,
    externalParentId: row.external_parent_id || undefined,
    externalName: row.external_name || undefined,
    status: row.status,
    metadata: row.metadata || {},
    lastVerifiedAt: row.last_verified_at || undefined,
  };
}

export class SupabaseSchedulingConnectionRepository implements SchedulingConnectionRepository {
  private readonly client: SchedulingConnectionSupabaseClientLike;

  constructor(client: BrowserSupabaseClient | SchedulingConnectionSupabaseClientLike) {
    this.client = client as unknown as SchedulingConnectionSupabaseClientLike;
  }

  async listConnections(
    context: SchedulingContext,
    input: ListSchedulingConnectionsInput = {},
  ): Promise<SchedulingConnection[]> {
    let query = this.client.from('scheduling_provider_connections')
      .select(connectionColumns)
      .eq('clinic_id', context.clinicId);
    if (!input.includeDisabled) query = query.neq('status', 'disabled');
    const rows = await unwrap<ConnectionRow[]>(query.order('created_at'));
    return rows.map(mapConnection);
  }

  async getConnection(context: SchedulingContext, connectionId: string): Promise<SchedulingConnection | null> {
    const row = await unwrap<ConnectionRow | null>(this.client.from('scheduling_provider_connections')
      .select(connectionColumns)
      .eq('clinic_id', context.clinicId)
      .eq('id', connectionId)
      .maybeSingle());
    return row ? mapConnection(row) : null;
  }

  async getDefaultConnectionForClinic(context: SchedulingContext): Promise<SchedulingConnection | null> {
    const row = await unwrap<ConnectionRow | null>(this.client.from('scheduling_provider_connections')
      .select(connectionColumns)
      .eq('clinic_id', context.clinicId)
      .eq('is_default', true)
      .maybeSingle());
    return row ? mapConnection(row) : null;
  }

  async getConnectionForProfessional(
    context: SchedulingContext,
    professionalId: string,
  ): Promise<SchedulingConnection | null> {
    const assignment = await unwrap<{ connection_id: string } | null>(this.client
      .from('scheduling_connection_professionals')
      .select('connection_id')
      .eq('clinic_id', context.clinicId)
      .eq('professional_id', professionalId)
      .eq('is_active', true)
      .maybeSingle());
    if (assignment) {
      const override = await this.getConnection(context, assignment.connection_id);
      if (override?.status === 'active') return override;
    }
    return this.getDefaultConnectionForClinic(context);
  }

  async listMappings(
    context: SchedulingContext,
    input: ListSchedulingMappingsInput,
  ): Promise<SchedulingEntityMapping[]> {
    const config = mappingConfig[input.entityType];
    let query = this.client.from(config.table)
      .select(`id,clinic_id,connection_id,${config.auraColumn},external_id,external_parent_id,external_name,status,metadata,last_verified_at`)
      .eq('clinic_id', context.clinicId)
      .eq('connection_id', input.connectionId);
    if (!input.includeDisabled) query = query.neq('status', 'disabled');
    const rows = await unwrap<MappingRow[]>(query.order('created_at'));
    return rows.map((row) => mapEntity(row, input.entityType));
  }

  async getMappingByAuraEntity(
    context: SchedulingContext,
    connectionId: string,
    entityType: SchedulingMappedEntityType,
    auraEntityId: string,
  ): Promise<SchedulingEntityMapping | null> {
    const config = mappingConfig[entityType];
    const row = await unwrap<MappingRow | null>(this.client.from(config.table)
      .select(`id,clinic_id,connection_id,${config.auraColumn},external_id,external_parent_id,external_name,status,metadata,last_verified_at`)
      .eq('clinic_id', context.clinicId)
      .eq('connection_id', connectionId)
      .eq(config.auraColumn, auraEntityId)
      .neq('status', 'disabled')
      .maybeSingle());
    return row ? mapEntity(row, entityType) : null;
  }

  async getMappingByExternalId(
    context: SchedulingContext,
    connectionId: string,
    entityType: SchedulingMappedEntityType,
    externalId: string,
  ): Promise<SchedulingEntityMapping | null> {
    const config = mappingConfig[entityType];
    const row = await unwrap<MappingRow | null>(this.client.from(config.table)
      .select(`id,clinic_id,connection_id,${config.auraColumn},external_id,external_parent_id,external_name,status,metadata,last_verified_at`)
      .eq('clinic_id', context.clinicId)
      .eq('connection_id', connectionId)
      .eq('external_id', externalId)
      .neq('status', 'disabled')
      .maybeSingle());
    return row ? mapEntity(row, entityType) : null;
  }

  async upsertMapping(
    context: SchedulingContext,
    input: UpsertSchedulingEntityMappingInput,
  ): Promise<SchedulingEntityMapping> {
    const config = mappingConfig[input.entityType];
    const existing = await this.getMappingByAuraEntity(
      context,
      input.connectionId,
      input.entityType,
      input.auraEntityId,
    );
    const values = {
      clinic_id: context.clinicId,
      connection_id: input.connectionId,
      [config.auraColumn]: input.auraEntityId,
      external_id: input.externalId,
      external_parent_id: input.externalParentId || null,
      external_name: input.externalName || null,
      status: input.status || 'active',
      metadata: input.metadata || {},
      last_verified_at: input.lastVerifiedAt || null,
    };
    const columns = `id,clinic_id,connection_id,${config.auraColumn},external_id,external_parent_id,external_name,status,metadata,last_verified_at`;
    const request = existing
      ? this.client.from(config.table).update(values).eq('clinic_id', context.clinicId).eq('id', existing.id)
      : this.client.from(config.table).insert(values);
    const row = await unwrap<MappingRow>(request.select(columns).single());
    return mapEntity(row, input.entityType);
  }

  async disableMapping(
    context: SchedulingContext,
    mappingId: string,
    entityType: SchedulingMappedEntityType,
  ): Promise<SchedulingEntityMapping> {
    const config = mappingConfig[entityType];
    const row = await unwrap<MappingRow>(this.client.from(config.table)
      .update({ status: 'disabled' })
      .eq('clinic_id', context.clinicId)
      .eq('id', mappingId)
      .select(`id,clinic_id,connection_id,${config.auraColumn},external_id,external_parent_id,external_name,status,metadata,last_verified_at`)
      .single());
    return mapEntity(row, entityType);
  }
}
