import type {
  SchedulingAppointment,
  SchedulingAppointmentStatus,
  SchedulingAppointmentType,
  SchedulingBillingType,
  SchedulingConfirmationStatus,
  SchedulingProviderKey,
  SchedulingSourceOfTruth,
  SchedulingSyncState,
} from '../domain/models.ts';
import type { IsoInstant } from '../domain/time.ts';

export type SchedulingEventOrigin =
  | 'agenda_ui'
  | 'aura_ai'
  | 'micro_crm'
  | 'waitlist'
  | 'system'
  | 'external_provider'
  | 'provider_import'
  | 'reconciliation';

export type SchedulingUnmappedEntityType = 'location' | 'professional' | 'service' | 'insurance';

export interface SchedulingExternalIdentity {
  connectionId: string;
  providerType: SchedulingProviderKey;
  externalAppointmentId: string;
}

export interface SchedulingSyncError {
  code: string;
  message?: string;
  occurredAt: IsoInstant;
}

export interface SchedulingSyncConflict {
  code: string;
  occurredAt: IsoInstant;
}

export interface SchedulingAppointmentMirror extends SchedulingAppointment {
  connectionId?: string;
  syncState: SchedulingSyncState;
  eventOrigin: SchedulingEventOrigin;
  unmappedEntityTypes: readonly SchedulingUnmappedEntityType[];
  syncError?: SchedulingSyncError;
  syncConflict?: SchedulingSyncConflict;
  isTombstone: boolean;
}

export interface UpsertExternalAppointmentMirrorInput {
  connectionId: string;
  providerType: SchedulingProviderKey;
  externalAppointmentId: string;
  sourceOfTruth: SchedulingSourceOfTruth;
  syncState: Exclude<SchedulingSyncState, 'not_applicable'>;
  eventOrigin: SchedulingEventOrigin;
  startAt: IsoInstant;
  endAt: IsoInstant;
  durationMinutes: number;
  status: SchedulingAppointmentStatus;
  confirmationStatus: SchedulingConfirmationStatus;
  appointmentType: SchedulingAppointmentType;
  billingType: SchedulingBillingType;
  locationId?: string;
  professionalId?: string;
  patientId?: string;
  leadId?: string;
  serviceId?: string;
  insuranceId?: string;
  notes?: string;
  confirmedAt?: IsoInstant;
  rawProviderStatus?: string;
  externalVersion?: string;
  externalEtag?: string;
  lastSyncedAt?: IsoInstant;
  lastProviderSeenAt?: IsoInstant;
  unmappedEntityTypes?: readonly SchedulingUnmappedEntityType[];
  syncConflict?: SchedulingSyncConflict;
}

export function getSchedulingWriteAuthority(
  sourceOfTruth: SchedulingSourceOfTruth,
): 'local' | 'provider' {
  return sourceOfTruth === 'aura' ? 'local' : 'provider';
}

export function canWriteSchedulingAppointmentLocally(
  appointment: Pick<SchedulingAppointment, 'sourceOfTruth'>,
): boolean {
  return getSchedulingWriteAuthority(appointment.sourceOfTruth) === 'local';
}
