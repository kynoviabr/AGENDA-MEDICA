import type { SchedulingContext } from '../domain/inputs';
import type { IsoInstant } from '../domain/time';
import type {
  RegisterSchedulingProviderEventInput,
  SchedulingProviderEvent,
  SchedulingProviderEventStatus,
  SchedulingReconciliationState,
  SchedulingSyncCheckpoint,
} from './models';

export interface SchedulingReconciliationRepository {
  getState(context: SchedulingContext, connectionId: string): Promise<SchedulingReconciliationState | null>;
  start(context: SchedulingContext, connectionId: string, startedAt: IsoInstant): Promise<SchedulingReconciliationState>;
  complete(
    context: SchedulingContext,
    connectionId: string,
    completedAt: IsoInstant,
    checkpoint: SchedulingSyncCheckpoint,
  ): Promise<SchedulingReconciliationState>;
  fail(
    context: SchedulingContext,
    connectionId: string,
    failedAt: IsoInstant,
    error: { code: string; message?: string },
  ): Promise<SchedulingReconciliationState>;
  registerProviderEvent(
    context: SchedulingContext,
    input: RegisterSchedulingProviderEventInput,
  ): Promise<SchedulingProviderEvent>;
  markProviderEvent(
    context: SchedulingContext,
    eventId: string,
    status: Exclude<SchedulingProviderEventStatus, 'pending'>,
    processedAt: IsoInstant,
    error?: { code: string; message?: string },
  ): Promise<SchedulingProviderEvent>;
}

export type SchedulingReconciliationRepositoryErrorCode =
  | 'duplicate_event'
  | 'unauthorized'
  | 'not_found'
  | 'repository_error';

export class SchedulingReconciliationRepositoryError extends Error {
  readonly code: SchedulingReconciliationRepositoryErrorCode;
  readonly originalError?: unknown;

  constructor(code: SchedulingReconciliationRepositoryErrorCode, message: string, originalError?: unknown) {
    super(message);
    this.name = 'SchedulingReconciliationRepositoryError';
    this.code = code;
    this.originalError = originalError;
  }
}
