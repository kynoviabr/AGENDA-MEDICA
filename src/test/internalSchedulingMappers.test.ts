import { describe, expect, it } from 'vitest';
import {
  mapDomainStatusesToInternal,
  mapInternalAppointment,
  mapInternalAppointmentStatus,
  mapInternalBillingType,
  mapInternalInsurance,
  mapInternalLocation,
  mapInternalService,
  type InternalAppointmentRecord,
  type InternalAppointmentStatus,
} from '@/scheduling';

const internalAppointment: InternalAppointmentRecord = {
  id: 'appointment-1',
  clinic_id: 'clinic-a',
  location_id: 'location-1',
  professional_id: 'professional-1',
  patient_id: 'patient-1',
  lead_id: null,
  treatment_id: 'service-1',
  health_insurance_id: null,
  billing_type: 'private',
  appointment_type: 'consultation',
  start_time: '2026-08-17T12:00:00.000Z',
  end_time: '2026-08-17T13:00:00.000Z',
  duration_minutes: 60,
  status: 'scheduled',
  confirmed_at: null,
  notes: null,
  cancelled_reason: null,
  no_show_reason: null,
  rescheduled_from: null,
  rescheduled_to: null,
};

describe('internal scheduling mappers', () => {
  it.each([
    ['scheduled', null, 'scheduled', 'pending'],
    ['scheduled', '2026-08-17T10:00:00.000Z', 'scheduled', 'confirmed'],
    ['confirmed', '2026-08-17T10:00:00.000Z', 'scheduled', 'confirmed'],
    ['in_progress', null, 'in_progress', 'not_required'],
    ['completed', '2026-08-17T10:00:00.000Z', 'completed', 'confirmed'],
    ['cancelled', null, 'cancelled', 'not_required'],
    ['no_show', null, 'no_show', 'not_required'],
    ['rescheduled', null, 'rescheduled', 'not_required'],
  ] as const)('maps internal status %s to operational and confirmation states', (internal, confirmedAt, status, confirmationStatus) => {
    expect(mapInternalAppointmentStatus(internal as InternalAppointmentStatus, confirmedAt)).toEqual({ status, confirmationStatus });
  });

  it('expands domain scheduled filters to both internal scheduled states', () => {
    expect(mapDomainStatusesToInternal(['scheduled', 'completed'])).toEqual(['scheduled', 'confirmed', 'completed']);
  });

  it('maps administrative billing types', () => {
    expect(mapInternalBillingType('private')).toBe('private');
    expect(mapInternalBillingType('insurance')).toBe('insurance');
  });

  it('normalizes an internal appointment without leaking SQL row names', () => {
    expect(mapInternalAppointment({
      ...internalAppointment,
      status: 'confirmed',
      confirmed_at: '2026-08-17T10:00:00.000Z',
      billing_type: 'insurance',
      health_insurance_id: 'insurance-1',
    })).toEqual(expect.objectContaining({
      id: 'appointment-1',
      provider: 'internal',
      sourceOfTruth: 'aura',
      syncState: 'not_applicable',
      status: 'scheduled',
      confirmationStatus: 'confirmed',
      rawProviderStatus: 'confirmed',
      billingType: 'insurance',
      insuranceId: 'insurance-1',
      startAt: internalAppointment.start_time,
      endAt: internalAppointment.end_time,
    }));
  });

  it('represents nullable legacy location and professional IDs without inventing values', () => {
    const mapped = mapInternalAppointment({ ...internalAppointment, location_id: null, professional_id: null });
    expect(mapped.locationId).toBeUndefined();
    expect(mapped.professionalId).toBeUndefined();
  });

  it('maps primary location, effective service rules and insurance notes', () => {
    expect(mapInternalLocation({ id: 'location-1', name: 'Principal', timezone: 'America/Sao_Paulo', active: true, is_primary: true }).isPrimary).toBe(true);
    expect(mapInternalService({ id: 'service-1', name: 'Consulta', duration_minutes: 60, is_active: true, can_ai_schedule: true, show_price: true, private_price: 300, requires_previous_evaluation: false })).toMatchObject({ privatePrice: 300, showPrice: true });
    expect(mapInternalInsurance({ id: 'insurance-1', name: 'Convênio', status: 'active', accepts_new_patients: true, authorization_required: true, appointment_duration_minutes: 20, ai_instructions: 'Solicitar carteirinha', notes: 'Guia prévia' })).toMatchObject({ requiresAuthorization: true, notes: 'Guia prévia' });
  });
});
