import { describe, expect, it, vi } from 'vitest';
import {
  InternalSchedulingProvider,
  SchedulingService,
  SchedulingSlotConflictError,
  type InternalAppointmentRecord,
  type InternalSchedulingDataSource,
} from '@/scheduling';

const context = { clinicId: 'clinic-a' };
const appointment: InternalAppointmentRecord = {
  id: 'appointment-1', clinic_id: 'clinic-a', location_id: 'location-1', professional_id: 'professional-1',
  patient_id: 'patient-1', lead_id: null, treatment_id: 'service-1', health_insurance_id: null,
  billing_type: 'private', appointment_type: 'consultation', start_time: '2026-08-17T12:00:00.000Z',
  end_time: '2026-08-17T13:00:00.000Z', duration_minutes: 60, status: 'scheduled', confirmed_at: null,
  notes: null, cancelled_reason: null, no_show_reason: null, rescheduled_from: null, rescheduled_to: null,
};

function createIntegration(overrides: Record<string, unknown> = {}) {
  const dataSource = {
    listLocations: vi.fn(async () => []),
    listProfessionals: vi.fn(async () => []),
    listServices: vi.fn(async () => []),
    listInsurances: vi.fn(async () => []),
    getProfessionalRules: vi.fn(async () => null),
    getAvailableSlots: vi.fn(async () => [{ start_time: appointment.start_time, end_time: appointment.end_time, duration_minutes: 60 }]),
    listAppointments: vi.fn(async () => [appointment]),
    getAppointment: vi.fn(async () => appointment),
    createAppointment: vi.fn(async () => appointment),
    confirmAppointment: vi.fn(async () => ({ ...appointment, status: 'confirmed', confirmed_at: '2026-08-17T11:00:00.000Z' })),
    cancelAppointment: vi.fn(async () => ({ ...appointment, status: 'cancelled', cancelled_reason: 'Paciente solicitou' })),
    rescheduleAppointment: vi.fn(async () => ({ ...appointment, id: 'appointment-2', rescheduled_from: appointment.id })),
    updateAppointmentStatus: vi.fn(async () => ({ ...appointment, status: 'completed' })),
    markNoShow: vi.fn(async () => ({ ...appointment, status: 'no_show' })),
    reassignProfessional: vi.fn(async () => appointment),
    listBlocks: vi.fn(async () => []),
    createBlock: vi.fn(async () => ({ id: 'block-1', location_id: null, professional_id: null, start_at: appointment.start_time, end_at: appointment.end_time, reason: null, notes: null })),
    removeBlock: vi.fn(async () => true),
    ...overrides,
  };
  const provider = new InternalSchedulingProvider({ dataSource: dataSource as unknown as InternalSchedulingDataSource });
  return { dataSource, provider, service: new SchedulingService(provider) };
}

describe('SchedulingService + InternalSchedulingProvider integration', () => {
  it('reads canonical slots through service, provider, mapper, and data source', async () => {
    const { service, dataSource } = createIntegration();
    const input = {
      locationId: 'location-1', professionalId: 'professional-1', serviceId: 'service-1',
      dateRange: { from: '2026-08-17', to: '2026-08-17' },
    };
    await expect(service.getAvailableSlots(context, input)).resolves.toEqual([
      expect.objectContaining({ locationId: 'location-1', professionalId: 'professional-1', durationMinutes: 60 }),
    ]);
    expect(dataSource.getAvailableSlots).toHaveBeenCalledWith(context, input);
  });

  it('creates and maps an internal appointment without exposing persistence fields', async () => {
    const { service } = createIntegration();
    await expect(service.createAppointment(context, {
      locationId: 'location-1', professionalId: 'professional-1', patientId: 'patient-1',
      billingType: 'private', appointmentType: 'consultation', startAt: appointment.start_time,
    })).resolves.toMatchObject({
      id: 'appointment-1', provider: 'internal', sourceOfTruth: 'aura', syncState: 'not_applicable',
      billingType: 'private', status: 'scheduled', confirmationStatus: 'pending',
    });
  });

  it('executes cancellation and rescheduling with tenant preflight', async () => {
    const { service, dataSource } = createIntegration();
    await expect(service.cancelAppointment(context, { appointmentId: 'appointment-1', reason: 'Paciente solicitou' })).resolves.toMatchObject({ status: 'cancelled' });
    await expect(service.rescheduleAppointment(context, { appointmentId: 'appointment-1', startAt: '2026-08-18T12:00:00.000Z' })).resolves.toMatchObject({ id: 'appointment-2', rescheduledFromId: 'appointment-1' });
    expect(dataSource.getAppointment).toHaveBeenCalledTimes(2);
  });

  it('normalizes a storage exclusion violation into a domain slot conflict', async () => {
    const { service } = createIntegration({
      createAppointment: vi.fn(async () => { throw { code: '23P01', message: 'AGENDA_SLOT_CONFLICT' }; }),
    });
    await expect(service.createAppointment(context, {
      locationId: 'location-1', professionalId: 'professional-1', patientId: 'patient-1',
      billingType: 'private', appointmentType: 'consultation', startAt: appointment.start_time,
    })).rejects.toBeInstanceOf(SchedulingSlotConflictError);
  });

  it('advertises unsupported future capabilities as disabled', () => {
    const { provider } = createIntegration();
    expect(provider.capabilities).toMatchObject({ webhooks: false, reconciliation: false });
  });
});
