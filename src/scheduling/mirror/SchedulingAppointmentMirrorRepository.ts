import type { SchedulingContext } from '../domain/inputs';
import type { IsoInstant } from '../domain/time';
import type {
  SchedulingAppointmentMirror,
  SchedulingSyncConflict,
  SchedulingSyncError,
  UpsertExternalAppointmentMirrorInput,
} from './models';

export interface SchedulingAppointmentMirrorRepository {
  getByExternalId(
    context: SchedulingContext,
    connectionId: string,
    externalAppointmentId: string,
  ): Promise<SchedulingAppointmentMirror | null>;
  upsertExternalMirror(
    context: SchedulingContext,
    input: UpsertExternalAppointmentMirrorInput,
  ): Promise<SchedulingAppointmentMirror>;
  markSynced(
    context: SchedulingContext,
    appointmentId: string,
    syncedAt: IsoInstant,
    providerSeenAt?: IsoInstant,
  ): Promise<SchedulingAppointmentMirror>;
  markConflict(
    context: SchedulingContext,
    appointmentId: string,
    conflict: SchedulingSyncConflict,
  ): Promise<SchedulingAppointmentMirror>;
  markError(
    context: SchedulingContext,
    appointmentId: string,
    error: SchedulingSyncError,
  ): Promise<SchedulingAppointmentMirror>;
  tombstone(
    context: SchedulingContext,
    appointmentId: string,
    tombstonedAt: IsoInstant,
  ): Promise<SchedulingAppointmentMirror>;
  listPending(context: SchedulingContext, connectionId: string): Promise<SchedulingAppointmentMirror[]>;
  listStale(
    context: SchedulingContext,
    connectionId: string,
    providerSeenBefore: IsoInstant,
  ): Promise<SchedulingAppointmentMirror[]>;
}

export type SchedulingMirrorRepositoryErrorCode =
  | 'duplicate_external_appointment'
  | 'provider_write_required'
  | 'unauthorized'
  | 'not_found'
  | 'repository_error';

export class SchedulingMirrorRepositoryError extends Error {
  readonly code: SchedulingMirrorRepositoryErrorCode;
  readonly originalError?: unknown;

  constructor(code: SchedulingMirrorRepositoryErrorCode, message: string, originalError?: unknown) {
    super(message);
    this.name = 'SchedulingMirrorRepositoryError';
    this.code = code;
    this.originalError = originalError;
  }
}
