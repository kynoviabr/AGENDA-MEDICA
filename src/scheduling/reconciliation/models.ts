import type { SchedulingProviderKey } from '../domain/models';
import type { IsoInstant } from '../domain/time';

export type SchedulingReconciliationStatus = 'idle' | 'running' | 'error';
export type SchedulingProviderEventStatus = 'pending' | 'processed' | 'ignored' | 'error';

export interface SchedulingSyncCheckpoint {
  checkpoint?: string;
  syncToken?: string;
  metadata: Readonly<Record<string, unknown>>;
}

export interface SchedulingReconciliationState {
  clinicId: string;
  connectionId: string;
  status: SchedulingReconciliationStatus;
  checkpoint: SchedulingSyncCheckpoint;
  lastStartedAt?: IsoInstant;
  lastCompletedAt?: IsoInstant;
  lastSuccessAt?: IsoInstant;
  lastError?: { code: string; message?: string; occurredAt: IsoInstant };
  consecutiveFailures: number;
}

export interface RegisterSchedulingProviderEventInput {
  connectionId: string;
  providerType: SchedulingProviderKey;
  externalEventId?: string;
  payloadHash?: string;
  eventType: string;
  externalAppointmentId?: string;
}

export interface SchedulingProviderEvent {
  id: string;
  clinicId: string;
  connectionId: string;
  providerType: SchedulingProviderKey;
  externalEventId?: string;
  payloadHash?: string;
  eventType: string;
  externalAppointmentId?: string;
  status: SchedulingProviderEventStatus;
  receivedAt: IsoInstant;
  processedAt?: IsoInstant;
}
