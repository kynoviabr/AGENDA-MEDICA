import type { IanaTimezone, IsoInstant, TimeRange } from './time.ts';
import type { WeeklyOperatingHours } from '../operatingHours/WorkingHoursPolicy.ts';

export type SchedulingProviderType =
  | 'internal'
  | 'google_calendar'
  | 'doctoralia'
  | 'feegow';

/** Known adapters stay strongly typed while persisted provider keys remain extensible. */
export type SchedulingProviderKey = SchedulingProviderType | (string & {});

export type SchedulingSourceOfTruth = 'aura' | 'external_provider';

export type SchedulingSyncState =
  | 'not_applicable'
  | 'synced'
  | 'pending_create'
  | 'pending_update'
  | 'pending_cancel'
  | 'conflict'
  | 'error'
  | 'stale'
  | 'tombstoned';

export type SchedulingSource =
  | 'agenda_ui'
  | 'aura_ai'
  | 'micro_crm'
  | 'waitlist'
  | 'system'
  | 'external_provider';

export type SchedulingBillingType = 'private' | 'insurance';

export type SchedulingAppointmentType =
  | 'consultation'
  | 'return'
  | 'evaluation'
  | 'post_operative';

/**
 * Operational lifecycle. Confirmation is deliberately modeled separately,
 * even though the current internal schema stores `confirmed` in its status enum.
 */
export type SchedulingAppointmentStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export type SchedulingConfirmationStatus = 'pending' | 'confirmed' | 'not_required';

export interface SchedulingLocation {
  id: string;
  name: string;
  timezone: IanaTimezone;
  active: boolean;
  isPrimary: boolean;
  openingHours?: WeeklyOperatingHours;
  hideClosedDays?: boolean;
  limitCalendarToOperatingHours?: boolean;
}

export interface SchedulingProfessional {
  id: string;
  fullName: string;
  specialty?: string;
  active: boolean;
  workingHours?: Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', Array<{ start: string; end: string }>>>;
}

export interface SchedulingServiceItem {
  id: string;
  name: string;
  durationMinutes?: number;
  active: boolean;
  canAiSchedule?: boolean;
  showPrice?: boolean;
  privatePrice?: number;
  requiresPreviousEvaluation?: boolean;
}

export interface SchedulingInsurance {
  id: string;
  name: string;
  active: boolean;
  acceptsNewPatients?: boolean;
  requiresAuthorization?: boolean;
  appointmentDurationMinutes?: number;
  aiInstructions?: string;
  notes?: string;
}

export interface SchedulingProfessionalRules {
  professionalId: string;
  acceptsNewPatients: boolean;
  allowAiBooking: boolean;
  allowAiCancellation: boolean;
  allowAiRescheduling: boolean;
  allowWaitlist: boolean;
  minimumBookingNoticeHours: number;
  maximumBookingDays: number;
  cancellationNoticeHours: number;
  defaultAppointmentDurationMinutes: number;
  privateAppointmentDurationMinutes: number;
}

export interface SchedulingSlot extends TimeRange {
  locationId?: string;
  professionalId?: string;
  durationMinutes: number;
}

export interface SchedulingAppointment extends TimeRange {
  id: string;
  provider: SchedulingProviderKey;
  connectionId?: string;
  externalId?: string;
  sourceOfTruth: SchedulingSourceOfTruth;
  syncState?: SchedulingSyncState;
  source?: SchedulingSource;
  locationId?: string;
  professionalId?: string;
  patientId?: string;
  leadId?: string;
  serviceId?: string;
  insuranceId?: string;
  billingType: SchedulingBillingType;
  appointmentType: SchedulingAppointmentType;
  durationMinutes: number;
  status: SchedulingAppointmentStatus;
  confirmationStatus: SchedulingConfirmationStatus;
  rawProviderStatus?: string;
  externalVersion?: string;
  externalEtag?: string;
  lastSyncedAt?: IsoInstant;
  lastProviderSeenAt?: IsoInstant;
  isTombstone?: boolean;
  tombstonedAt?: IsoInstant;
  notes?: string;
  cancellationReason?: string;
  rescheduledFromId?: string;
  rescheduledToId?: string;
  confirmedAt?: IsoInstant;
}

export interface SchedulingBlock extends TimeRange {
  id: string;
  locationId?: string;
  professionalId?: string;
  reason?: string;
  notes?: string;
}
