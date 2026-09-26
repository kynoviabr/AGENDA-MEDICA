import type { SchedulingContext } from '../domain/inputs.ts';
import type {
  SchedulingConnection,
  SchedulingEntityMapping,
  SchedulingMappedEntityType,
  UpsertSchedulingEntityMappingInput,
} from './models.ts';

export type ListSchedulingConnectionsInput = {
  includeDisabled?: boolean;
};

export type ListSchedulingMappingsInput = {
  connectionId: string;
  entityType: SchedulingMappedEntityType;
  includeDisabled?: boolean;
};

export interface SchedulingConnectionRepository {
  listConnections(
    context: SchedulingContext,
    input?: ListSchedulingConnectionsInput,
  ): Promise<SchedulingConnection[]>;
  getConnection(context: SchedulingContext, connectionId: string): Promise<SchedulingConnection | null>;
  getDefaultConnectionForClinic(context: SchedulingContext): Promise<SchedulingConnection | null>;
  getConnectionForProfessional(
    context: SchedulingContext,
    professionalId: string,
  ): Promise<SchedulingConnection | null>;
  listMappings(
    context: SchedulingContext,
    input: ListSchedulingMappingsInput,
  ): Promise<SchedulingEntityMapping[]>;
  getMappingByAuraEntity(
    context: SchedulingContext,
    connectionId: string,
    entityType: SchedulingMappedEntityType,
    auraEntityId: string,
  ): Promise<SchedulingEntityMapping | null>;
  getMappingByExternalId(
    context: SchedulingContext,
    connectionId: string,
    entityType: SchedulingMappedEntityType,
    externalId: string,
  ): Promise<SchedulingEntityMapping | null>;
  upsertMapping(
    context: SchedulingContext,
    input: UpsertSchedulingEntityMappingInput,
  ): Promise<SchedulingEntityMapping>;
  disableMapping(
    context: SchedulingContext,
    mappingId: string,
    entityType: SchedulingMappedEntityType,
  ): Promise<SchedulingEntityMapping>;
}

export type SchedulingConnectionRepositoryErrorCode =
  | 'duplicate_mapping'
  | 'unauthorized'
  | 'not_found'
  | 'repository_error';

export class SchedulingConnectionRepositoryError extends Error {
  readonly code: SchedulingConnectionRepositoryErrorCode;
  readonly originalError?: unknown;

  constructor(code: SchedulingConnectionRepositoryErrorCode, message: string, originalError?: unknown) {
    super(message);
    this.name = 'SchedulingConnectionRepositoryError';
    this.code = code;
    this.originalError = originalError;
  }
}
