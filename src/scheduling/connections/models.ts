import type { SchedulingProviderCapabilities } from '../domain/capabilities.ts';
import type { SchedulingProviderKey, SchedulingSourceOfTruth } from '../domain/models.ts';
import type { IsoInstant } from '../domain/time.ts';

export type SchedulingConnectionStatus =
  | 'pending'
  | 'active'
  | 'disconnected'
  | 'error'
  | 'reauthorization_required'
  | 'disabled';

export type SchedulingConnectionScope = 'clinic' | 'professional';

export type SchedulingMappedEntityType =
  | 'location'
  | 'professional'
  | 'service'
  | 'insurance';

export type SchedulingEntityMappingStatus = 'active' | 'stale' | 'invalid' | 'disabled';

export interface SchedulingConnection {
  id: string;
  clinicId: string;
  providerType: SchedulingProviderKey;
  status: SchedulingConnectionStatus;
  displayName: string;
  externalAccountId?: string;
  externalAccountName?: string;
  sourceOfTruth: SchedulingSourceOfTruth;
  capabilities: Partial<SchedulingProviderCapabilities>;
  metadata: Readonly<Record<string, unknown>>;
  isDefault: boolean;
  connectedAt?: IsoInstant;
  disconnectedAt?: IsoInstant;
  lastVerifiedAt?: IsoInstant;
}

export interface SchedulingConnectionProfessionalAssignment {
  id: string;
  clinicId: string;
  connectionId: string;
  professionalId: string;
  isActive: boolean;
}

export interface SchedulingEntityMapping {
  id: string;
  clinicId: string;
  connectionId: string;
  entityType: SchedulingMappedEntityType;
  auraEntityId: string;
  externalId: string;
  externalParentId?: string;
  externalName?: string;
  status: SchedulingEntityMappingStatus;
  metadata: Readonly<Record<string, unknown>>;
  lastVerifiedAt?: IsoInstant;
}

export interface UpsertSchedulingEntityMappingInput {
  connectionId: string;
  entityType: SchedulingMappedEntityType;
  auraEntityId: string;
  externalId: string;
  externalParentId?: string;
  externalName?: string;
  status?: Exclude<SchedulingEntityMappingStatus, 'disabled'>;
  metadata?: Readonly<Record<string, unknown>>;
  lastVerifiedAt?: IsoInstant;
}
