import { describe, expect, it, vi } from 'vitest';
import {
  InternalSchedulingProvider,
  SchedulingNotFoundError,
  SchedulingProviderError,
  SchedulingSlotConflictError,
  SchedulingUnauthorizedError,
  SchedulingValidationError,
  type InternalAppointmentRecord,
  type InternalSchedulingDataSource,
  type SchedulingContext,
} from '@/scheduling';

const context: SchedulingContext = { clinicId: 'clinic-a' };
const changedAt = '2026-08-17T10:00:00.000Z';

const appointment: InternalAppointmentRecord = {
  id: 'appointment-1', clinic_id: 'clinic-a', location_id: 'location-1', professional_id: 'professional-1',
  patient_id: 'patient-1', lead_id: null, treatment_id: 'service-1', health_insurance_id: null,
  billing_type: 'private', appointment_type: 'consultation', start_time: '2026-08-17T12:00:00.000Z',
  end_time: '2026-08-17T13:00:00.000Z', duration_minutes: 60, status: 'scheduled', confirmed_at: null,
  notes: null, cancelled_reason: null, no_show_reason: null, rescheduled_from: null, rescheduled_to: null,
};

function createDataSource(overrides: Record<string, unknown> = {}) {
  return {
    listLocations: vi.fn(async () => [{ id: 'location-1', name: 'Principal', timezone: 'America/Sao_Paulo', active: true, is_primary: true }]),
    listProfessionals: vi.fn(async () => [{ id: 'professional-1', full_name: 'Dra. Aura', specialty: 'Dermatologia', status: 'active' }]),
    listServices: vi.fn(async () => [{ id: 'service-1', name: 'Consulta', duration_minutes: 60, is_active: true, can_ai_schedule: true, show_price: true, private_price: 300, requires_previous_evaluation: false }]),
    listInsurances: vi.fn(async () => [{ id: 'insurance-1', name: 'Convênio', status: 'active', accepts_new_patients: true, authorization_required: false, appointment_duration_minutes: 20, ai_instructions: null, notes: null }]),
    getProfessionalRules: vi.fn(async () => ({ professional_id: 'professional-1', accept_new_patients: true, allow_ai_booking: false, allow_ai_cancellation: false, allow_ai_rescheduling: false, allow_waitlist: true, minimum_booking_notice_hours: 2, maximum_booking_days: 90, cancellation_notice_hours: 24, default_appointment_duration_minutes: 30, private_appointment_duration_minutes: 60 })),
    getAvailableSlots: vi.fn(async () => [{ start_time: appointment.start_time, end_time: appointment.end_time, duration_minutes: 60 }]),
    listAppointments: vi.fn(async () => [appointment]),
    getAppointment: vi.fn(async () => appointment),
    createAppointment: vi.fn(async () => appointment),
    confirmAppointment: vi.fn(async () => ({ ...appointment, status: 'confirmed' as const, confirmed_at: changedAt })),
    cancelAppointment: vi.fn(async () => ({ ...appointment, status: 'cancelled' as const, cancelled_reason: 'Paciente solicitou' })),
    rescheduleAppointment: vi.fn(async () => ({ ...appointment, id: 'appointment-2', rescheduled_from: appointment.id })),
    updateAppointmentStatus: vi.fn(async () => ({ ...appointment, status: 'completed' as const })),
    markNoShow: vi.fn(async () => ({ ...appointment, status: 'no_show' as const, no_show_reason: 'Ausente' })),
    reassignProfessional: vi.fn(async () => ({ ...appointment, professional_id: 'professional-2' })),
    listBlocks: vi.fn(async () => [{ id: 'block-1', location_id: 'location-1', professional_id: null, start_at: appointment.start_time, end_at: appointment.end_time, reason: 'Reunião', notes: null }]),
    createBlock: vi.fn(async () => ({ id: 'block-1', location_id: 'location-1', professional_id: null, start_at: appointment.start_time, end_at: appointment.end_time, reason: 'Reunião', notes: null })),
    removeBlock: vi.fn(async () => true),
    ...overrides,
  };
}

function createProvider(dataSource = createDataSource()) {
  return {
    dataSource,
    provider: new InternalSchedulingProvider({
      dataSource: dataSource as unknown as InternalSchedulingDataSource,
    }),
  };
}

describe('InternalSchedulingProvider', () => {
  it('declares only implemented internal capabilities', () => {
    const { provider } = createProvider();
    expect(provider.type).toBe('internal');
    expect(provider.name).toBe('Aura Internal Scheduling');
    expect(Object.entries(provider.capabilities).filter(([, enabled]) => enabled).map(([name]) => name)).toEqual([
      'locations', 'professionals', 'services', 'insurances', 'professionalRules', 'readAvailability',
      'readAppointments', 'createAppointment', 'confirmAppointment', 'cancelAppointment', 'rescheduleAppointment',
      'updateAppointmentStatus', 'markNoShow', 'reassignProfessional', 'readBlocks', 'createBlock', 'removeBlock',
    ]);
    expect(provider.capabilities.webhooks).toBe(false);
    expect(provider.capabilities.reconciliation).toBe(false);
  });

  it('maps catalog operations and always propagates clinic context', async () => {
    const { provider, dataSource } = createProvider();
    await expect(provider.listLocations(context, { activeOnly: true })).resolves.toEqual([expect.objectContaining({ id: 'location-1', isPrimary: true })]);
    await expect(provider.listProfessionals(context, { locationId: 'location-1' })).resolves.toEqual([expect.objectContaining({ fullName: 'Dra. Aura' })]);
    await expect(provider.listServices(context, { professionalId: 'professional-1' })).resolves.toEqual([expect.objectContaining({ privatePrice: 300 })]);
    await expect(provider.listInsurances(context, { professionalId: 'professional-1' })).resolves.toEqual([expect.objectContaining({ appointmentDurationMinutes: 20 })]);
    expect(dataSource.listLocations).toHaveBeenCalledWith(context, { activeOnly: true });
    expect(dataSource.listProfessionals).toHaveBeenCalledWith(context, { locationId: 'location-1' });
    expect(dataSource.listServices).toHaveBeenCalledWith(context, { professionalId: 'professional-1' });
    expect(dataSource.listInsurances).toHaveBeenCalledWith(context, { professionalId: 'professional-1' });
  });

  it('maps professional rules', async () => {
    const { provider } = createProvider();
    await expect(provider.getProfessionalRules(context, { professionalId: 'professional-1' })).resolves.toMatchObject({
      professionalId: 'professional-1', privateAppointmentDurationMinutes: 60, maximumBookingDays: 90,
    });
  });

  it('delegates canonical availability and supplies slot identity', async () => {
    const { provider, dataSource } = createProvider();
    const input = {
      locationId: 'location-1', professionalId: 'professional-1',
      billingType: 'insurance' as const, insuranceId: 'insurance-1',
      dateRange: { from: '2026-08-17', to: '2026-08-17' },
    };
    await expect(provider.getAvailableSlots(context, input)).resolves.toEqual([expect.objectContaining({ locationId: 'location-1', professionalId: 'professional-1', durationMinutes: 60 })]);
    expect(dataSource.getAvailableSlots).toHaveBeenCalledWith(context, input);
  });

  it('maps appointment reads to Aura source of truth', async () => {
    const { provider } = createProvider();
    const listInput = { range: { startAt: '2026-08-17T00:00:00.000Z', endAt: '2026-08-18T00:00:00.000Z' } };
    await expect(provider.listAppointments(context, listInput)).resolves.toEqual([expect.objectContaining({ provider: 'internal', sourceOfTruth: 'aura' })]);
    await expect(provider.getAppointment(context, { appointmentId: appointment.id })).resolves.toMatchObject({ id: appointment.id, syncState: 'not_applicable' });
  });

  it('creates an appointment through the injected data source', async () => {
    const { provider, dataSource } = createProvider();
    const input = { locationId: 'location-1', professionalId: 'professional-1', patientId: 'patient-1', billingType: 'private' as const, appointmentType: 'consultation' as const, startAt: appointment.start_time };
    await expect(provider.createAppointment(context, input)).resolves.toMatchObject({ id: appointment.id, status: 'scheduled' });
    expect(dataSource.createAppointment).toHaveBeenCalledWith(context, input);
  });

  it('confirms an appointment through the canonical data source operation and separates confirmation status', async () => {
    const { provider, dataSource } = createProvider();
    const input = { appointmentId: appointment.id };
    await expect(provider.confirmAppointment(context, input)).resolves.toMatchObject({ status: 'scheduled', confirmationStatus: 'confirmed', confirmedAt: changedAt });
    expect(dataSource.getAppointment).toHaveBeenCalledWith(context, input);
    expect(dataSource.confirmAppointment).toHaveBeenCalledWith(context, input);
  });

  it('uses canonical lifecycle operations after a clinic-scoped preflight read', async () => {
    const { provider, dataSource } = createProvider();
    await expect(provider.cancelAppointment(context, { appointmentId: appointment.id, reason: 'Paciente solicitou' })).resolves.toMatchObject({ status: 'cancelled' });
    await expect(provider.rescheduleAppointment(context, { appointmentId: appointment.id, startAt: '2026-08-18T12:00:00.000Z' })).resolves.toMatchObject({ id: 'appointment-2', rescheduledFromId: appointment.id });
    await expect(provider.markNoShow(context, { appointmentId: appointment.id, reason: 'Ausente' })).resolves.toMatchObject({ status: 'no_show', cancellationReason: 'Ausente' });
    await expect(provider.reassignProfessional(context, { appointmentId: appointment.id, professionalId: 'professional-2' })).resolves.toMatchObject({ professionalId: 'professional-2' });
    expect(dataSource.getAppointment).toHaveBeenCalledTimes(4);
  });

  it('returns the database-authoritative duration and insurance metadata after reassignment', async () => {
    const hardenedResult: InternalAppointmentRecord = {
      ...appointment,
      professional_id: 'professional-2',
      billing_type: 'insurance',
      health_insurance_id: 'insurance-1',
      end_time: '2026-08-17T12:45:00.000Z',
      duration_minutes: 45,
    };
    const { provider } = createProvider(createDataSource({
      reassignProfessional: vi.fn(async () => hardenedResult),
    }));

    await expect(provider.reassignProfessional(context, {
      appointmentId: appointment.id,
      professionalId: 'professional-2',
    })).resolves.toMatchObject({
      professionalId: 'professional-2',
      endAt: '2026-08-17T12:45:00.000Z',
      durationMinutes: 45,
      billingType: 'insurance',
      insuranceId: 'insurance-1',
    });
  });

  it('updates operational status through the canonical data source operation', async () => {
    const { provider, dataSource } = createProvider();
    const input = { appointmentId: appointment.id, status: 'completed' as const };
    await expect(provider.updateAppointmentStatus(context, input)).resolves.toMatchObject({ status: 'completed' });
    expect(dataSource.updateAppointmentStatus).toHaveBeenCalledWith(context, input);
  });

  it('maps block CRUD without leaking rows', async () => {
    const { provider, dataSource } = createProvider();
    const range = { startAt: appointment.start_time, endAt: appointment.end_time };
    await expect(provider.listBlocks(context, { range, locationId: 'location-1' })).resolves.toEqual([expect.objectContaining({ id: 'block-1', reason: 'Reunião' })]);
    await expect(provider.createBlock(context, { ...range, locationId: 'location-1', reason: 'Reunião' })).resolves.toMatchObject({ id: 'block-1' });
    await expect(provider.removeBlock(context, { blockId: 'block-1' })).resolves.toBeUndefined();
    expect(dataSource.removeBlock).toHaveBeenCalledWith(context, { blockId: 'block-1' });
  });

  it('returns not found for a resource outside the explicit clinic scope', async () => {
    const { provider } = createProvider(createDataSource({ getAppointment: vi.fn(async () => null) }));
    await expect(provider.getAppointment(context, { appointmentId: 'missing' })).rejects.toBeInstanceOf(SchedulingNotFoundError);
  });

  it.each([
    [{ code: '23P01', message: 'AGENDA_SLOT_CONFLICT' }, SchedulingSlotConflictError],
    [{ code: '42501', message: 'AGENDA_FORBIDDEN' }, SchedulingUnauthorizedError],
    [{ code: '22023', message: 'AGENDA_INVALID_DURATION' }, SchedulingValidationError],
    [{ code: '22023', message: 'AGENDA_DURATION_MISMATCH' }, SchedulingValidationError],
    [{ code: '22023', message: 'AGENDA_INVALID_STATUS_TRANSITION' }, SchedulingValidationError],
    [{ code: 'XX000', message: 'unexpected database error' }, SchedulingProviderError],
  ])('normalizes internal errors without exposing raw SQL messages', async (rawError, expectedError) => {
    const { provider } = createProvider(createDataSource({ createAppointment: vi.fn(async () => { throw rawError; }) }));
    await expect(provider.createAppointment(context, { locationId: 'location-1', professionalId: 'professional-1', patientId: 'patient-1', billingType: 'private', appointmentType: 'consultation', startAt: appointment.start_time })).rejects.toBeInstanceOf(expectedError);
  });

  it('rejects missing clinic context before touching the data source', async () => {
    const { provider, dataSource } = createProvider();
    await expect(provider.listLocations({ clinicId: ' ' }, {})).rejects.toBeInstanceOf(SchedulingValidationError);
    expect(dataSource.listLocations).not.toHaveBeenCalled();
  });
});
