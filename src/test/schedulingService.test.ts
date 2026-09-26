import { describe, expect, it, vi } from 'vitest';
import {
  createSchedulingProviderCapabilities,
  SchedulingCapabilityNotSupportedError,
  SchedulingProviderError,
  SchedulingService,
  SchedulingSlotConflictError,
  SchedulingValidationError,
  type SchedulingAppointment,
  type SchedulingContext,
  type SchedulingProvider,
  type SchedulingSlot,
} from '@/scheduling';

const clinicContext: SchedulingContext = { clinicId: 'clinic-a' };

const appointment: SchedulingAppointment = {
  id: 'appointment-1',
  provider: 'internal',
  sourceOfTruth: 'aura',
  syncState: 'not_applicable',
  source: 'agenda_ui',
  locationId: 'location-1',
  professionalId: 'professional-1',
  patientId: 'patient-1',
  billingType: 'private',
  appointmentType: 'consultation',
  startAt: '2026-08-17T12:00:00.000Z',
  endAt: '2026-08-17T13:00:00.000Z',
  durationMinutes: 60,
  status: 'scheduled',
  confirmationStatus: 'pending',
};

const slot: SchedulingSlot = {
  locationId: 'location-1',
  professionalId: 'professional-1',
  startAt: '2026-08-17T12:00:00.000Z',
  endAt: '2026-08-17T13:00:00.000Z',
  durationMinutes: 60,
};

const enabledCapabilities = createSchedulingProviderCapabilities([
  'readAvailability',
  'readAppointments',
  'createAppointment',
  'cancelAppointment',
  'rescheduleAppointment',
]);

function fakeProvider(overrides: Partial<SchedulingProvider> = {}): SchedulingProvider {
  return {
    type: 'internal',
    name: 'Fake scheduling provider',
    capabilities: enabledCapabilities,
    ...overrides,
  } as SchedulingProvider;
}

describe('SchedulingService', () => {
  it('delegates getAvailableSlots with explicit tenant context', async () => {
    const getAvailableSlots = vi.fn(async () => [slot]);
    const service = new SchedulingService(fakeProvider({ getAvailableSlots }));
    const input = {
      locationId: 'location-1',
      professionalId: 'professional-1',
      dateRange: { from: '2026-08-17', to: '2026-08-17' },
    };

    await expect(service.getAvailableSlots(clinicContext, input)).resolves.toEqual([slot]);
    expect(getAvailableSlots).toHaveBeenCalledWith(clinicContext, input);
  });

  it('does not let an external free/busy provider expand Aura working hours', async () => {
    const outside = { ...slot, startAt: '2026-08-17T09:00:00.000Z', endAt: '2026-08-17T10:00:00.000Z' };
    const provider = fakeProvider({
      type: 'google_calendar',
      capabilities: createSchedulingProviderCapabilities(['locations', 'professionals', 'readAvailability']),
      getAvailableSlots: vi.fn(async () => [outside, slot]),
      listLocations: vi.fn(async () => [{
        id: 'location-1', name: 'Unidade', timezone: 'America/Sao_Paulo', active: true, isPrimary: true,
        openingHours: { schemaVersion: 1, weekdays: { '1': [{ start: '08:00', end: '18:00' }] } },
      }]),
      listProfessionals: vi.fn(async () => [{
        id: 'professional-1', fullName: 'Dra. Teste', active: true,
        workingHours: { '1': [{ start: '08:00', end: '18:00' }] },
      }]),
    });
    const service = new SchedulingService(provider);

    await expect(service.getAvailableSlots(clinicContext, {
      locationId: 'location-1', professionalId: 'professional-1',
      dateRange: { from: '2026-08-17', to: '2026-08-17' },
    })).resolves.toEqual([slot]);
  });

  it('delegates listAppointments and returns provider-neutral appointments', async () => {
    const listAppointments = vi.fn(async () => [appointment]);
    const service = new SchedulingService(fakeProvider({ listAppointments }));
    const input = {
      range: {
        startAt: '2026-08-17T00:00:00.000Z',
        endAt: '2026-08-18T00:00:00.000Z',
      },
    };

    const result = await service.listAppointments(clinicContext, input);

    expect(listAppointments).toHaveBeenCalledWith(clinicContext, input);
    expect(result[0]).toMatchObject({
      provider: 'internal',
      sourceOfTruth: 'aura',
      status: 'scheduled',
      confirmationStatus: 'pending',
    });
  });

  it('delegates appointment creation', async () => {
    const createAppointment = vi.fn(async () => appointment);
    const service = new SchedulingService(fakeProvider({ createAppointment }));
    const input = {
      locationId: 'location-1',
      professionalId: 'professional-1',
      patientId: 'patient-1',
      billingType: 'private' as const,
      appointmentType: 'consultation' as const,
      startAt: appointment.startAt,
    };

    await expect(service.createAppointment(clinicContext, input)).resolves.toEqual(appointment);
    expect(createAppointment).toHaveBeenCalledWith(clinicContext, input);
  });

  it('delegates appointment cancellation', async () => {
    const cancelled = { ...appointment, status: 'cancelled' as const, cancellationReason: 'Paciente solicitou' };
    const cancelAppointment = vi.fn(async () => cancelled);
    const service = new SchedulingService(fakeProvider({ cancelAppointment }));
    const input = { appointmentId: appointment.id, reason: 'Paciente solicitou' };

    await expect(service.cancelAppointment(clinicContext, input)).resolves.toEqual(cancelled);
    expect(cancelAppointment).toHaveBeenCalledWith(clinicContext, input);
  });

  it('delegates appointment rescheduling', async () => {
    const rescheduled = {
      ...appointment,
      id: 'appointment-2',
      startAt: '2026-08-18T12:00:00.000Z',
      endAt: '2026-08-18T13:00:00.000Z',
      rescheduledFromId: appointment.id,
    };
    const rescheduleAppointment = vi.fn(async () => rescheduled);
    const service = new SchedulingService(fakeProvider({ rescheduleAppointment }));
    const input = { appointmentId: appointment.id, startAt: rescheduled.startAt };

    await expect(service.rescheduleAppointment(clinicContext, input)).resolves.toEqual(rescheduled);
    expect(rescheduleAppointment).toHaveBeenCalledWith(clinicContext, input);
  });

  it('rejects an operation when the provider capability is disabled', async () => {
    const provider = fakeProvider({
      capabilities: createSchedulingProviderCapabilities(['readAppointments']),
      createAppointment: vi.fn(async () => appointment),
    });
    const service = new SchedulingService(provider);

    await expect(service.createAppointment(clinicContext, {
      locationId: 'location-1',
      professionalId: 'professional-1',
      patientId: 'patient-1',
      billingType: 'private',
      appointmentType: 'consultation',
      startAt: appointment.startAt,
    })).rejects.toBeInstanceOf(SchedulingCapabilityNotSupportedError);
    expect(provider.createAppointment).not.toHaveBeenCalled();
  });

  it('normalizes an unknown provider failure', async () => {
    const originalError = new Error('provider-specific failure');
    const service = new SchedulingService(fakeProvider({
      listAppointments: vi.fn(async () => { throw originalError; }),
    }));

    try {
      await service.listAppointments(clinicContext, {
        range: { startAt: '2026-08-17T00:00:00.000Z', endAt: '2026-08-18T00:00:00.000Z' },
      });
      throw new Error('Expected listAppointments to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(SchedulingProviderError);
      expect(error).toMatchObject({
        code: 'SCHEDULING_PROVIDER_ERROR',
        provider: 'internal',
        originalError,
      });
    }
  });

  it('preserves an error already normalized by the provider', async () => {
    const normalizedError = new SchedulingSlotConflictError('internal');
    const service = new SchedulingService(fakeProvider({
      createAppointment: vi.fn(async () => { throw normalizedError; }),
    }));

    await expect(service.createAppointment(clinicContext, {
      locationId: 'location-1',
      professionalId: 'professional-1',
      patientId: 'patient-1',
      billingType: 'private',
      appointmentType: 'consultation',
      startAt: appointment.startAt,
    })).rejects.toBe(normalizedError);
  });

  it('keeps clinicId isolated across calls without implicit tenant state', async () => {
    const seenClinicIds: string[] = [];
    const listAppointments = vi.fn(async (context: SchedulingContext) => {
      seenClinicIds.push(context.clinicId);
      return [appointment];
    });
    const service = new SchedulingService(fakeProvider({ listAppointments }));
    const input = {
      range: { startAt: '2026-08-17T00:00:00.000Z', endAt: '2026-08-18T00:00:00.000Z' },
    };

    await service.listAppointments({ clinicId: 'clinic-a' }, input);
    await service.listAppointments({ clinicId: 'clinic-b' }, input);

    expect(seenClinicIds).toEqual(['clinic-a', 'clinic-b']);
  });

  it('requires clinicId before resolving or calling a provider', async () => {
    const listAppointments = vi.fn(async () => [appointment]);
    const service = new SchedulingService(fakeProvider({ listAppointments }));

    await expect(service.listAppointments({ clinicId: ' ' }, {
      range: { startAt: '2026-08-17T00:00:00.000Z', endAt: '2026-08-18T00:00:00.000Z' },
    })).rejects.toBeInstanceOf(SchedulingValidationError);
    expect(listAppointments).not.toHaveBeenCalled();
  });
});
