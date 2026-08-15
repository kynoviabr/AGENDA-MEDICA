import type {
  SchedulingAppointment,
  SchedulingAppointmentStatus,
  SchedulingAppointmentType,
  SchedulingBillingType,
  SchedulingBlock,
  SchedulingConfirmationStatus,
  SchedulingInsurance,
  SchedulingLocation,
  SchedulingProfessional,
  SchedulingProfessionalRules,
  SchedulingServiceItem,
  SchedulingSlot,
} from '../../domain/models.ts';
import type {
  InternalAppointmentRecord,
  InternalAppointmentStatus,
  InternalBlockRecord,
  InternalInsuranceRecord,
  InternalLocationRecord,
  InternalProfessionalRecord,
  InternalProfessionalRulesRecord,
  InternalServiceRecord,
  InternalSlotRecord,
} from './InternalSchedulingDataSource.ts';

interface DomainStatusMapping {
  status: SchedulingAppointmentStatus;
  confirmationStatus: SchedulingConfirmationStatus;
}

export function mapInternalAppointmentStatus(
  status: InternalAppointmentStatus,
  confirmedAt: string | null,
): DomainStatusMapping {
  if (status === 'confirmed') {
    return { status: 'scheduled', confirmationStatus: 'confirmed' };
  }

  if (status === 'scheduled') {
    return { status: 'scheduled', confirmationStatus: confirmedAt ? 'confirmed' : 'pending' };
  }

  return {
    status,
    confirmationStatus: confirmedAt ? 'confirmed' : 'not_required',
  };
}

export function mapDomainStatusesToInternal(
  statuses: readonly SchedulingAppointmentStatus[],
): InternalAppointmentStatus[] {
  return Array.from(new Set(statuses.flatMap((status) =>
    status === 'scheduled' ? ['scheduled', 'confirmed'] as const : [status],
  ))) as InternalAppointmentStatus[];
}

export function mapInternalBillingType(value: string): SchedulingBillingType {
  return value === 'insurance' ? 'insurance' : 'private';
}

export function mapInternalAppointmentType(value: string): SchedulingAppointmentType {
  if (value === 'return' || value === 'evaluation' || value === 'post_operative') return value;
  return 'consultation';
}

export function mapInternalLocation(record: InternalLocationRecord): SchedulingLocation {
  return {
    id: record.id,
    name: record.name,
    timezone: record.timezone,
    active: record.active,
    isPrimary: record.is_primary,
  };
}

export function mapInternalProfessional(record: InternalProfessionalRecord): SchedulingProfessional {
  return {
    id: record.id,
    fullName: record.full_name,
    specialty: record.specialty || undefined,
    active: record.status === 'active',
  };
}

export function mapInternalService(record: InternalServiceRecord): SchedulingServiceItem {
  return {
    id: record.id,
    name: record.name,
    durationMinutes: record.duration_minutes ?? undefined,
    active: record.is_active,
    canAiSchedule: record.can_ai_schedule ?? undefined,
    showPrice: record.show_price ?? undefined,
    privatePrice: record.private_price ?? undefined,
    requiresPreviousEvaluation: record.requires_previous_evaluation ?? undefined,
  };
}

export function mapInternalInsurance(record: InternalInsuranceRecord): SchedulingInsurance {
  return {
    id: record.id,
    name: record.name,
    active: record.status === 'active',
    acceptsNewPatients: record.accepts_new_patients ?? undefined,
    requiresAuthorization: record.authorization_required ?? undefined,
    appointmentDurationMinutes: record.appointment_duration_minutes ?? undefined,
    aiInstructions: record.ai_instructions || undefined,
    notes: record.notes || undefined,
  };
}

export function mapInternalProfessionalRules(record: InternalProfessionalRulesRecord): SchedulingProfessionalRules {
  return {
    professionalId: record.professional_id,
    acceptsNewPatients: record.accept_new_patients,
    allowAiBooking: record.allow_ai_booking,
    allowAiCancellation: record.allow_ai_cancellation,
    allowAiRescheduling: record.allow_ai_rescheduling,
    allowWaitlist: record.allow_waitlist,
    minimumBookingNoticeHours: record.minimum_booking_notice_hours,
    maximumBookingDays: record.maximum_booking_days,
    cancellationNoticeHours: record.cancellation_notice_hours,
    defaultAppointmentDurationMinutes: record.default_appointment_duration_minutes,
    privateAppointmentDurationMinutes: record.private_appointment_duration_minutes,
  };
}

export function mapInternalSlot(
  record: InternalSlotRecord,
  locationId: string,
  professionalId: string,
): SchedulingSlot {
  return {
    locationId,
    professionalId,
    startAt: record.start_time,
    endAt: record.end_time,
    durationMinutes: record.duration_minutes,
  };
}

export function mapInternalAppointment(record: InternalAppointmentRecord): SchedulingAppointment {
  const status = mapInternalAppointmentStatus(record.status, record.confirmed_at);

  return {
    id: record.id,
    provider: 'internal',
    sourceOfTruth: 'aura',
    syncState: 'not_applicable',
    locationId: record.location_id || undefined,
    professionalId: record.professional_id || undefined,
    patientId: record.patient_id || undefined,
    leadId: record.lead_id || undefined,
    serviceId: record.treatment_id || undefined,
    insuranceId: record.health_insurance_id || undefined,
    billingType: mapInternalBillingType(record.billing_type),
    appointmentType: mapInternalAppointmentType(record.appointment_type),
    startAt: record.start_time,
    endAt: record.end_time,
    durationMinutes: record.duration_minutes,
    status: status.status,
    confirmationStatus: status.confirmationStatus,
    rawProviderStatus: record.status,
    notes: record.notes || undefined,
    cancellationReason: (record.status === 'no_show' ? record.no_show_reason : record.cancelled_reason) || undefined,
    rescheduledFromId: record.rescheduled_from || undefined,
    rescheduledToId: record.rescheduled_to || undefined,
    confirmedAt: record.confirmed_at || undefined,
  };
}

export function mapInternalBlock(record: InternalBlockRecord): SchedulingBlock {
  return {
    id: record.id,
    locationId: record.location_id || undefined,
    professionalId: record.professional_id || undefined,
    startAt: record.start_at,
    endAt: record.end_at,
    reason: record.reason || undefined,
    notes: record.notes || undefined,
  };
}
