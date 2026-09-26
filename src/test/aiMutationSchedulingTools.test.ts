import { describe, expect, it, vi } from 'vitest';
import { AiToolRegistry, AuraSchedulingToolExecutor, createEmptyConversationState, type AiToolRequest } from '@/ai';
import { SchedulingService, type SchedulingProvider } from '@/scheduling';

const context = { clinicId: 'clinic-a', conversationId: 'conversation-a', channel: 'whatsapp' as const, correlationId: 'correlation-a', patientId: 'patient-a' };
const enabled = { engineMode: 'active' as const, readEnabled: true, readValidatedAt: '2026-08-15T23:00:00.000Z', mutationsEnabled: true };
const appointment = {
  id: 'appointment-a', provider: 'internal' as const, sourceOfTruth: 'aura' as const, billingType: 'private' as const,
  appointmentType: 'consultation' as const, startAt: '2026-08-20T12:00:00.000Z', endAt: '2026-08-20T13:00:00.000Z',
  durationMinutes: 60, status: 'scheduled' as const, confirmationStatus: 'pending' as const,
  patientId: 'patient-a', professionalId: 'professional-a', locationId: 'location-a', serviceId: 'service-a',
};

function fakeProvider(overrides: Partial<SchedulingProvider> = {}): SchedulingProvider {
  return {
    type: 'internal', name: 'fake', capabilities: {
      locations: true, professionals: true, services: true, insurances: true, professionalRules: true,
      readAvailability: true, readAppointments: true, createAppointment: true, confirmAppointment: true,
      cancelAppointment: true, rescheduleAppointment: true, updateAppointmentStatus: true, markNoShow: true,
      reassignProfessional: true, readBlocks: true, createBlock: true, removeBlock: true, webhooks: false, reconciliation: false,
    },
    listLocations: vi.fn(async () => [{ id: 'location-a', name: 'Centro', timezone: 'America/Sao_Paulo', active: true, isPrimary: true }]),
    listProfessionals: vi.fn(async () => [{ id: 'professional-a', fullName: 'Dra. Ana', active: true }]),
    listServices: vi.fn(async () => [{ id: 'service-a', name: 'Consulta', active: true, canAiSchedule: true }]),
    listInsurances: vi.fn(async () => []),
    listAppointments: vi.fn(async () => [appointment]),
    getProfessionalRules: vi.fn(async () => ({
      professionalId: 'professional-a', acceptsNewPatients: true, allowAiBooking: true,
      allowAiCancellation: true, allowAiRescheduling: true, allowWaitlist: true,
      minimumBookingNoticeHours: 2, maximumBookingDays: 90, cancellationNoticeHours: 24,
      defaultAppointmentDurationMinutes: 30, privateAppointmentDurationMinutes: 60,
    })),
    getAvailableSlots: vi.fn(async () => [
      { startAt: '2026-08-20T12:00:00.000Z', endAt: '2026-08-20T13:00:00.000Z', durationMinutes: 60 },
      { startAt: '2026-08-22T14:00:00.000Z', endAt: '2026-08-22T15:00:00.000Z', durationMinutes: 60 },
    ]),
    createAppointment: vi.fn(async () => appointment), confirmAppointment: vi.fn(async () => ({ ...appointment, confirmationStatus: 'confirmed' as const })),
    cancelAppointment: vi.fn(async () => ({ ...appointment, status: 'cancelled' as const })),
    rescheduleAppointment: vi.fn(async (_context, input) => ({ ...appointment, startAt: input.startAt })),
    ...overrides,
  };
}

function mutation(name: AiToolRequest['name'], intent: AiToolRequest['intent'], args: Record<string, unknown>): AiToolRequest {
  return { schemaVersion: 1, name, kind: 'mutation', intent, arguments: args };
}

function executor(provider: SchedulingProvider, claim = vi.fn(async () => true)) {
  return { claim, value: new AuraSchedulingToolExecutor(new SchedulingService(provider), new AiToolRegistry(), undefined, () => new Date('2026-08-15T12:00:00.000Z'), { claim }) };
}

describe('5.6C.2 mutation scheduling tools', () => {
  it('creates through SchedulingService only after resolving IDs and professional authorization', async () => {
    const provider = fakeProvider();
    const { value, claim } = executor(provider);
    const result = await value.execute({ context, conversationState: createEmptyConversationState(), config: enabled, tool: mutation('create_appointment', 'scheduling_request', {
      professionalName: 'Ana', serviceName: 'Consulta', billingType: 'private', startAt: '2026-08-20T12:00:00.000Z',
    }) });
    expect(result).toMatchObject({ outcome: 'success', data: { appointment: { reference: 'appointment-a' } } });
    expect(provider.createAppointment).toHaveBeenCalledWith({ clinicId: 'clinic-a' }, expect.objectContaining({ patientId: 'patient-a', professionalId: 'professional-a', source: 'aura_ai' }));
    expect(claim).toHaveBeenCalledOnce();
  });

  it('fails closed when no atomic mutation guard is configured', async () => {
    const provider = fakeProvider();
    const value = new AuraSchedulingToolExecutor(new SchedulingService(provider));
    const result = await value.execute({ context, conversationState: createEmptyConversationState(), config: enabled, tool: mutation('confirm_appointment', 'confirmation_request', {}) });
    expect(result).toMatchObject({ outcome: 'denied', errorCode: 'AI_TOOL_AUTHORIZATION_DENIED' });
    expect(provider.confirmAppointment).not.toHaveBeenCalled();
  });

  it('blocks mutation if read tools are disabled even after an old validation timestamp', async () => {
    const provider = fakeProvider();
    const { value } = executor(provider);
    const result = await value.execute({ context, conversationState: createEmptyConversationState(), config: { ...enabled, readEnabled: false }, tool: mutation('confirm_appointment', 'confirmation_request', {}) });
    expect(result).toMatchObject({ outcome: 'denied', errorCode: 'AI_TOOL_READ_DISABLED' });
    expect(provider.confirmAppointment).not.toHaveBeenCalled();
  });

  it('enforces per-professional cancellation permission before claiming or writing', async () => {
    const provider = fakeProvider({ getProfessionalRules: vi.fn(async () => ({
      professionalId: 'professional-a', acceptsNewPatients: true, allowAiBooking: true, allowAiCancellation: false,
      allowAiRescheduling: true, allowWaitlist: true, minimumBookingNoticeHours: 2, maximumBookingDays: 90,
      cancellationNoticeHours: 24, defaultAppointmentDurationMinutes: 30, privateAppointmentDurationMinutes: 60,
    })) });
    const { value, claim } = executor(provider);
    const result = await value.execute({ context, conversationState: createEmptyConversationState(), config: enabled, tool: mutation('cancel_appointment', 'cancellation_request', {}) });
    expect(result).toMatchObject({ outcome: 'denied', errorCode: 'AI_TOOL_AUTHORIZATION_DENIED' });
    expect(claim).not.toHaveBeenCalled();
    expect(provider.cancelAppointment).not.toHaveBeenCalled();
  });

  it('scopes appointment resolution to the trusted patient context before confirming', async () => {
    const provider = fakeProvider();
    const { value } = executor(provider);
    const result = await value.execute({ context, conversationState: createEmptyConversationState(), config: enabled, tool: mutation('confirm_appointment', 'confirmation_request', { appointmentReference: 'appointment-a' }) });
    expect(result.outcome).toBe('success');
    expect(provider.listAppointments).toHaveBeenCalledWith({ clinicId: 'clinic-a' }, expect.objectContaining({ patientId: 'patient-a' }));
    expect(provider.confirmAppointment).toHaveBeenCalledWith({ clinicId: 'clinic-a' }, { appointmentId: 'appointment-a' });
  });

  it('prevents duplicate mutation when the atomic claim reports an existing execution', async () => {
    const provider = fakeProvider();
    const { value } = executor(provider, vi.fn(async () => false));
    const result = await value.execute({ context, conversationState: createEmptyConversationState(), config: enabled, tool: mutation('reschedule_appointment', 'reschedule_request', { startAt: '2026-08-22T14:00:00.000Z' }) });
    expect(result).toMatchObject({ outcome: 'denied', errorCode: 'AI_TOOL_AUTHORIZATION_DENIED' });
    expect(provider.rescheduleAppointment).not.toHaveBeenCalled();
  });

  it('rejects a model-supplied time that was not returned by authoritative availability', async () => {
    const provider = fakeProvider({ getAvailableSlots: vi.fn(async () => []) });
    const { value, claim } = executor(provider);
    const result = await value.execute({ context, conversationState: createEmptyConversationState(), config: enabled, tool: mutation('create_appointment', 'scheduling_request', {
      professionalName: 'Ana', serviceName: 'Consulta', billingType: 'private', startAt: '2026-08-20T12:00:00.000Z',
    }) });
    expect(result).toMatchObject({ outcome: 'denied', errorCode: 'AI_TOOL_AUTHORIZATION_DENIED' });
    expect(claim).not.toHaveBeenCalled();
    expect(provider.createAppointment).not.toHaveBeenCalled();
  });
});
