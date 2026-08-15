import { describe, expect, it, vi } from 'vitest';
import {
  AiToolRegistry,
  AuraSchedulingToolExecutor,
  ConversationStateToolPlanner,
  createEmptyConversationState,
  type AiToolAuditEvent,
  type AiToolAuditRecorder,
  type AiToolRequest,
} from '@/ai';
import { SchedulingService, type SchedulingProvider } from '@/scheduling';

const clinicId = 'clinic-a';
const context = { clinicId, conversationId: 'conversation-a', channel: 'whatsapp' as const, correlationId: 'correlation-a', leadId: 'lead-a' };
const config = { readEnabled: true, readValidatedAt: undefined, mutationsEnabled: false };

function provider(overrides: Partial<SchedulingProvider> = {}): SchedulingProvider {
  return {
    type: 'internal', name: 'fake',
    capabilities: {
      locations: true, professionals: true, services: true, insurances: true, professionalRules: true,
      readAvailability: true, readAppointments: true, createAppointment: true, confirmAppointment: true,
      cancelAppointment: true, rescheduleAppointment: true, updateAppointmentStatus: true, markNoShow: true,
      reassignProfessional: true, readBlocks: true, createBlock: true, removeBlock: true,
      webhooks: false, reconciliation: false,
    },
    listLocations: vi.fn(async () => [{ id: 'location-a', name: 'Unidade Centro', timezone: 'America/Sao_Paulo', active: true, isPrimary: true }]),
    listProfessionals: vi.fn(async () => [{ id: 'professional-a', fullName: 'Dra. Ana', specialty: 'Dermatologia', active: true }]),
    listServices: vi.fn(async () => [{ id: 'service-a', name: 'Consulta dermatológica', durationMinutes: 60, active: true, canAiSchedule: true, showPrice: false, privatePrice: 500 }]),
    listInsurances: vi.fn(async () => [{ id: 'insurance-a', name: 'Unimed', active: true, acceptsNewPatients: true, requiresAuthorization: true }]),
    getProfessionalRules: vi.fn(async () => ({
      professionalId: 'professional-a', acceptsNewPatients: true, allowAiBooking: true,
      allowAiCancellation: true, allowAiRescheduling: true, allowWaitlist: true,
      minimumBookingNoticeHours: 2, maximumBookingDays: 90, cancellationNoticeHours: 24,
      defaultAppointmentDurationMinutes: 30, privateAppointmentDurationMinutes: 60,
    })),
    getAvailableSlots: vi.fn(async () => [{
      startAt: '2026-08-18T12:00:00.000Z', endAt: '2026-08-18T13:00:00.000Z',
      locationId: 'location-a', professionalId: 'professional-a', durationMinutes: 60,
    }]),
    listAppointments: vi.fn(async () => [{
      id: 'appointment-a', provider: 'internal', sourceOfTruth: 'aura', billingType: 'private',
      appointmentType: 'consultation', startAt: '2026-08-20T12:00:00.000Z', endAt: '2026-08-20T13:00:00.000Z',
      durationMinutes: 60, status: 'scheduled', confirmationStatus: 'pending', leadId: 'lead-a',
    }]),
    ...overrides,
  };
}

function tool(name: AiToolRequest['name'], intent: AiToolRequest['intent'], args: Record<string, unknown> = {}): AiToolRequest {
  const mutation = ['create_appointment', 'confirm_appointment', 'cancel_appointment', 'reschedule_appointment'].includes(name);
  return { schemaVersion: 1, name, kind: mutation ? 'mutation' : 'read', intent, arguments: args };
}

function executor(overrides: Partial<SchedulingProvider> = {}, audit?: AiToolAuditRecorder) {
  return { provider: provider(overrides), value: new AuraSchedulingToolExecutor(new SchedulingService(provider(overrides)), new AiToolRegistry(), audit) };
}

describe('5.6C.1 read-only scheduling tools', () => {
  it('plans availability from typed conversation state without exposing tenant identifiers as LLM arguments', () => {
    const state = createEmptyConversationState();
    state.entities = {
      professional: { value: 'Dra. Ana', source: 'user_text', confidence: 'high', requiresConfirmation: false },
      billingType: { value: 'private', source: 'user_text', confidence: 'high', requiresConfirmation: false },
      date: { value: { raw: 'terça', kind: 'exact_date', resolvedDate: '2026-08-18', timezone: 'America/Sao_Paulo' }, source: 'user_text', confidence: 'high', requiresConfirmation: false },
    };
    const planned = new ConversationStateToolPlanner().plan({ context, intent: 'scheduling_request', state });
    expect(planned).toMatchObject({ name: 'get_available_slots', kind: 'read', arguments: { professionalName: 'Dra. Ana', dateFrom: '2026-08-18' } });
    expect(JSON.stringify(planned)).not.toContain(clinicId);
    expect(JSON.stringify(planned)).not.toContain(context.conversationId);
  });

  it('rejects unknown arguments before invoking SchedulingService', async () => {
    const listLocations = vi.fn();
    const { value } = executor({ listLocations });
    const result = await value.execute({ context, conversationState: createEmptyConversationState(), config, tool: tool('list_locations', 'location_question', { clinicId: 'clinic-b' }) });
    expect(result).toMatchObject({ outcome: 'denied', errorCode: 'AI_TOOL_INVALID_REQUEST' });
    expect(listLocations).not.toHaveBeenCalled();
  });

  it('blocks every read when the clinic gate is disabled', async () => {
    const listLocations = vi.fn();
    const { value } = executor({ listLocations });
    const result = await value.execute({ context, conversationState: createEmptyConversationState(), config: { ...config, readEnabled: false }, tool: tool('list_locations', 'location_question') });
    expect(result).toMatchObject({ outcome: 'denied', errorCode: 'AI_TOOL_READ_DISABLED' });
    expect(listLocations).not.toHaveBeenCalled();
  });

  it('resolves names to IDs inside the application and returns only sanitized availability', async () => {
    const fake = provider();
    const auditEvents: AiToolAuditEvent[] = [];
    const value = new AuraSchedulingToolExecutor(new SchedulingService(fake), new AiToolRegistry(), { record: async (event) => { auditEvents.push(event); } });
    const result = await value.execute({
      context, conversationState: createEmptyConversationState(), config,
      tool: tool('get_available_slots', 'scheduling_request', {
        professionalName: 'Ana', serviceName: 'dermatológica', billingType: 'private', dateFrom: '2026-08-18', dateTo: '2026-08-18',
      }),
    });
    expect(result).toMatchObject({ outcome: 'success', data: { professional: { name: 'Dra. Ana' }, slots: [{ durationMinutes: 60 }] } });
    expect(fake.getAvailableSlots).toHaveBeenCalledWith({ clinicId }, expect.objectContaining({ locationId: 'location-a', professionalId: 'professional-a', serviceId: 'service-a' }));
    expect(JSON.stringify(result)).not.toContain('professional-a');
    expect(JSON.stringify(result)).not.toContain('location-a');
    expect(auditEvents).toEqual([expect.objectContaining({ toolName: 'get_available_slots', outcome: 'success' })]);
  });

  it('does not reveal a private service price when showPrice is false', async () => {
    const { value } = executor();
    const result = await value.execute({ context, conversationState: createEmptyConversationState(), config, tool: tool('list_services', 'price_question') });
    expect(result.outcome).toBe('success');
    expect(JSON.stringify(result.data)).not.toContain('500');
  });

  it('scopes appointment lookup to the identity from trusted execution context', async () => {
    const fake = provider();
    const value = new AuraSchedulingToolExecutor(new SchedulingService(fake));
    const result = await value.execute({ context, conversationState: createEmptyConversationState(), config, tool: tool('find_patient_appointments', 'cancellation_request') });
    expect(result.outcome).toBe('success');
    expect(fake.listAppointments).toHaveBeenCalledWith({ clinicId }, expect.objectContaining({ leadId: 'lead-a' }));
    expect(JSON.stringify(result.data)).not.toContain('lead-a');
  });

  it('denies patient appointment lookup without a trusted patient or lead identity', async () => {
    const { value } = executor();
    const result = await value.execute({
      context: { ...context, leadId: undefined }, conversationState: createEmptyConversationState(), config,
      tool: tool('find_patient_appointments', 'confirmation_request'),
    });
    expect(result).toMatchObject({ outcome: 'denied', errorCode: 'AI_TOOL_AUTHORIZATION_DENIED' });
  });

  it('keeps mutation tools blocked before read validation', async () => {
    const createAppointment = vi.fn();
    const { value } = executor({ createAppointment });
    const result = await value.execute({
      context, conversationState: createEmptyConversationState(), config,
      tool: tool('create_appointment', 'scheduling_request', { professionalName: 'Ana', billingType: 'private', startAt: '2026-08-18T12:00:00.000Z' }),
    });
    expect(result).toMatchObject({ outcome: 'denied', errorCode: 'AI_TOOL_READ_NOT_VALIDATED' });
    expect(createAppointment).not.toHaveBeenCalled();
  });
});
