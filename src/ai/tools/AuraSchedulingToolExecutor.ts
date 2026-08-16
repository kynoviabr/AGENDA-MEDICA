import type {
  SchedulingAppointment,
  SchedulingInsurance,
  SchedulingLocation,
  SchedulingProfessional,
  SchedulingServiceItem,
  SchedulingSlot,
} from '../../scheduling/domain/models.ts';
import type { SchedulingService } from '../../scheduling/services/SchedulingService.ts';
import { workingHoursPolicy } from '../../scheduling/operatingHours/WorkingHoursPolicy.ts';
import type { AiPresentedOption } from '../domain/conversation.ts';
import type {
  AiToolAuditRecorder,
  AiToolExecutionRequest,
  AiToolMutationGuard,
  AiToolResult,
} from './domain.ts';
import { DenyAiToolMutationGuard, NoopAiToolAuditRecorder } from './domain.ts';
import { AiToolError } from './errors.ts';
import { AiToolRegistry } from './registry.ts';

const MAX_CATALOG_RESULTS = 20;
const MAX_SLOT_RESULTS = 6;
const MAX_APPOINTMENT_RESULTS = 5;

export class AuraSchedulingToolExecutor {
  constructor(
    private readonly scheduling: SchedulingService,
    private readonly registry = new AiToolRegistry(),
    private readonly audit: AiToolAuditRecorder = new NoopAiToolAuditRecorder(),
    private readonly now: () => Date = () => new Date(),
    private readonly mutationGuard: AiToolMutationGuard = new DenyAiToolMutationGuard(),
  ) {}

  async execute(request: AiToolExecutionRequest): Promise<AiToolResult> {
    const startedAt = performance.now();
    let result: AiToolResult;
    try {
      const definition = this.registry.validate(request.tool);
      if (definition.kind === 'read' && !request.config.readEnabled) {
        throw new AiToolError('AI_TOOL_READ_DISABLED', 'Read tools are disabled for this clinic.');
      }
      if (definition.kind === 'mutation') {
        if (!request.config.readEnabled) throw new AiToolError('AI_TOOL_READ_DISABLED', 'Read tools must remain enabled for mutations.');
        if (!request.config.readValidatedAt) throw new AiToolError('AI_TOOL_READ_NOT_VALIDATED', 'Read tools must be validated before mutations.');
        if (request.config.engineMode !== 'active') throw new AiToolError('AI_TOOL_MUTATION_DISABLED', 'Mutations require active engine mode.');
        if (!request.config.mutationsEnabled) throw new AiToolError('AI_TOOL_MUTATION_DISABLED', 'Mutation tools are disabled for this clinic.');
      }
      result = definition.kind === 'read'
        ? await this.executeRead(request)
        : await this.executeMutation(request);
    } catch (error) {
      const normalized = error instanceof AiToolError
        ? error
        : new AiToolError('AI_TOOL_EXECUTION_FAILED', 'The scheduling tool could not be executed.', error);
      result = {
        schemaVersion: 1, toolName: request.tool.name, kind: request.tool.kind,
        outcome: normalized.code === 'AI_TOOL_ENTITY_AMBIGUOUS' ? 'clarification_required'
          : normalized.code === 'AI_TOOL_EXECUTION_FAILED' ? 'error' : 'denied',
        errorCode: normalized.code, message: safeErrorMessage(normalized.code),
      };
    }
    try {
      await this.audit.record({
        context: request.context, toolName: request.tool.name, kind: request.tool.kind,
        outcome: result.outcome, errorCode: result.errorCode,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)), occurredAt: this.now().toISOString(),
      });
    } catch {
      // A mutation may already be committed. Its atomic claim remains as the
      // durable idempotency trail, so an audit write failure must not trigger it again.
    }
    return result;
  }

  private async executeRead(request: AiToolExecutionRequest): Promise<AiToolResult> {
    const context = { clinicId: request.context.clinicId };
    const args = request.tool.arguments;
    switch (request.tool.name) {
      case 'list_locations': {
        const locations = (await this.scheduling.listLocations(context, { activeOnly: true })).slice(0, MAX_CATALOG_RESULTS);
        return success(request, locations.map(sanitizeLocation), options(locations, 'location'));
      }
      case 'list_professionals': {
        const location = await this.resolveOptionalLocation(context, textArg(args, 'locationName'));
        const professionals = (await this.scheduling.listProfessionals(context, { locationId: location?.id, activeOnly: true })).slice(0, MAX_CATALOG_RESULTS);
        return success(request, professionals.map(sanitizeProfessional), options(professionals, 'professional'));
      }
      case 'list_services': {
        const professional = await this.resolveOptionalProfessional(context, textArg(args, 'professionalName'));
        const services = (await this.scheduling.listServices(context, { professionalId: professional?.id, activeOnly: true }))
          .filter((item) => item.canAiSchedule !== false).slice(0, MAX_CATALOG_RESULTS);
        return success(request, services.map(sanitizeService), options(services, 'service'));
      }
      case 'list_insurances': {
        const professional = await this.resolveOptionalProfessional(context, textArg(args, 'professionalName'));
        const insurances = (await this.scheduling.listInsurances(context, { professionalId: professional?.id, activeOnly: true }))
          .filter((item) => item.acceptsNewPatients !== false).slice(0, MAX_CATALOG_RESULTS);
        return success(request, insurances.map(sanitizeInsurance), options(insurances, 'insurance'));
      }
      case 'get_available_slots':
        return this.availableSlots(request);
      case 'find_patient_appointments':
        return this.patientAppointments(request);
      default:
        throw new AiToolError('AI_TOOL_NOT_REGISTERED', 'Read tool is not implemented.');
    }
  }

  private async executeMutation(request: AiToolExecutionRequest): Promise<AiToolResult> {
    const context = { clinicId: request.context.clinicId };
    const args = request.tool.arguments;
    if (!request.context.patientId && !request.context.leadId) {
      throw new AiToolError('AI_TOOL_AUTHORIZATION_DENIED', 'A trusted patient or lead identity is required.');
    }

    if (request.tool.name === 'create_appointment') {
      const location = await this.resolveLocation(context, textArg(args, 'locationName'));
      const professional = await this.resolveProfessionalForAvailability(context, location.id, textArg(args, 'professionalName'), textArg(args, 'serviceName'));
      const service = await this.resolveOptionalService(context, professional.id, textArg(args, 'serviceName'));
      const billingType = textArg(args, 'billingType');
      if (billingType !== 'private' && billingType !== 'insurance') throw new AiToolError('AI_TOOL_INVALID_REQUEST', 'Billing type is invalid.');
      const insurance = billingType === 'insurance'
        ? await this.resolveInsurance(context, professional.id, textArg(args, 'insuranceName'))
        : undefined;
      const rules = await this.scheduling.getProfessionalRules(context, { professionalId: professional.id });
      if (!rules.allowAiBooking || service?.canAiSchedule === false) throw new AiToolError('AI_TOOL_AUTHORIZATION_DENIED', 'AI booking is not allowed for this professional or service.');
      const startAt = isoInstantArg(args, 'startAt');
      await this.assertAvailableSlot(context, {
        location, professional, service, insurance, billingType, startAt,
      });
      await this.claimMutation(request);
      const appointment = await this.scheduling.createAppointment(context, {
        locationId: location.id, professionalId: professional.id,
        patientId: request.context.patientId, leadId: request.context.leadId,
        serviceId: service?.id, insuranceId: insurance?.id, billingType,
        appointmentType: 'consultation', startAt, timezone: location.timezone,
        source: 'aura_ai', notes: 'Agendado pelo Aura IA.',
      });
      return success(request, { appointment: sanitizeAppointment(appointment), professional: sanitizeProfessional(professional), location: sanitizeLocation(location) });
    }

    const appointment = await this.resolvePatientAppointment(request, textArg(args, 'appointmentReference'));
    if (!appointment.professionalId) throw new AiToolError('AI_TOOL_AUTHORIZATION_DENIED', 'The appointment has no eligible professional.');
    const rules = await this.scheduling.getProfessionalRules(context, { professionalId: appointment.professionalId });

    if (request.tool.name === 'confirm_appointment') {
      if (!rules.allowAiBooking) throw new AiToolError('AI_TOOL_AUTHORIZATION_DENIED', 'AI confirmation is not allowed for this professional.');
      await this.claimMutation(request);
      return success(request, { appointment: sanitizeAppointment(await this.scheduling.confirmAppointment(context, { appointmentId: appointment.id })) });
    }
    if (request.tool.name === 'cancel_appointment') {
      if (!rules.allowAiCancellation || hoursUntil(appointment.startAt, this.now()) < rules.cancellationNoticeHours) {
        throw new AiToolError('AI_TOOL_AUTHORIZATION_DENIED', 'AI cancellation is not allowed by the professional rules.');
      }
      await this.claimMutation(request);
      return success(request, { appointment: sanitizeAppointment(await this.scheduling.cancelAppointment(context, {
        appointmentId: appointment.id, reason: textArg(args, 'reason') || 'Cancelamento solicitado pelo paciente via Aura IA',
      })) });
    }
    if (request.tool.name === 'reschedule_appointment') {
      if (!rules.allowAiRescheduling) throw new AiToolError('AI_TOOL_AUTHORIZATION_DENIED', 'AI rescheduling is not allowed for this professional.');
      const startAt = isoInstantArg(args, 'startAt');
      if (!appointment.locationId) throw new AiToolError('AI_TOOL_AUTHORIZATION_DENIED', 'The appointment has no eligible location.');
      const locations = await this.scheduling.listLocations(context, { activeOnly: true });
      const location = locations.find((item) => item.id === appointment.locationId);
      const professionals = await this.scheduling.listProfessionals(context, { locationId: appointment.locationId, activeOnly: true });
      const professional = professionals.find((item) => item.id === appointment.professionalId);
      if (!location || !professional) throw new AiToolError('AI_TOOL_ENTITY_NOT_FOUND', 'The appointment catalog references are inactive.');
      const services = appointment.serviceId ? await this.scheduling.listServices(context, { professionalId: professional.id, activeOnly: true }) : [];
      const service = services.find((item) => item.id === appointment.serviceId);
      const insurances = appointment.insuranceId ? await this.scheduling.listInsurances(context, { professionalId: professional.id, activeOnly: true }) : [];
      const insurance = insurances.find((item) => item.id === appointment.insuranceId);
      await this.assertAvailableSlot(context, { location, professional, service, insurance, billingType: appointment.billingType, startAt });
      await this.claimMutation(request);
      return success(request, { appointment: sanitizeAppointment(await this.scheduling.rescheduleAppointment(context, {
        appointmentId: appointment.id, startAt, reason: 'Reagendamento solicitado pelo paciente via Aura IA',
      })) });
    }
    throw new AiToolError('AI_TOOL_NOT_REGISTERED', 'Mutation tool is not implemented.');
  }

  private async availableSlots(request: AiToolExecutionRequest): Promise<AiToolResult> {
    const context = { clinicId: request.context.clinicId };
    const args = request.tool.arguments;
    const existing = request.tool.intent === 'reschedule_request'
      ? await this.resolvePatientAppointment(request, textArg(args, 'appointmentReference'))
      : undefined;
    const locations = existing?.locationId ? await this.scheduling.listLocations(context, { activeOnly: true }) : [];
    const location = existing?.locationId
      ? locations.find((item) => item.id === existing.locationId) || await this.resolveLocation(context, textArg(args, 'locationName'))
      : await this.resolveLocation(context, textArg(args, 'locationName'));
    const professionals = existing?.professionalId ? await this.scheduling.listProfessionals(context, { locationId: location.id, activeOnly: true }) : [];
    const professional = existing?.professionalId
      ? professionals.find((item) => item.id === existing.professionalId) || await this.resolveProfessionalForAvailability(context, location.id, textArg(args, 'professionalName'), textArg(args, 'serviceName'))
      : await this.resolveProfessionalForAvailability(context, location.id, textArg(args, 'professionalName'), textArg(args, 'serviceName'));
    const services = existing?.serviceId ? await this.scheduling.listServices(context, { professionalId: professional.id, activeOnly: true }) : [];
    const service = existing?.serviceId
      ? services.find((item) => item.id === existing.serviceId)
      : await this.resolveOptionalService(context, professional.id, textArg(args, 'serviceName'));
    const billingType = existing?.billingType || textArg(args, 'billingType');
    if (billingType !== 'private' && billingType !== 'insurance') throw new AiToolError('AI_TOOL_INVALID_REQUEST', 'Billing type is invalid.');
    const insurances = existing?.insuranceId ? await this.scheduling.listInsurances(context, { professionalId: professional.id, activeOnly: true }) : [];
    const insurance = billingType === 'insurance'
      ? (insurances.find((item) => item.id === existing?.insuranceId) || await this.resolveInsurance(context, professional.id, textArg(args, 'insuranceName')))
      : undefined;
    const rules = await this.scheduling.getProfessionalRules(context, { professionalId: professional.id });
    if (!rules.allowAiBooking) throw new AiToolError('AI_TOOL_AUTHORIZATION_DENIED', 'This professional does not allow AI booking.');
    const dateFrom = isoDateArg(args, 'dateFrom');
    const dateTo = isoDateArg(args, 'dateTo');
    if (location.openingHours && isoDatesInclusive(dateFrom, dateTo).every((date) =>
      !workingHoursPolicy.isLocationOpen(date, location.openingHours),
    )) {
      return success(request, {
        location: sanitizeLocation(location), professional: sanitizeProfessional(professional),
        service: service ? sanitizeService(service) : undefined,
        insurance: insurance ? sanitizeInsurance(insurance) : undefined,
        slots: [], restrictionReason: 'location_closed',
      });
    }
    if (professional.workingHours && isoDatesInclusive(dateFrom, dateTo).every((date) =>
      !workingHoursPolicy.isProfessionalWorking(date, professional.workingHours || {}),
    )) {
      return success(request, {
        location: sanitizeLocation(location), professional: sanitizeProfessional(professional),
        service: service ? sanitizeService(service) : undefined,
        insurance: insurance ? sanitizeInsurance(insurance) : undefined,
        slots: [], restrictionReason: 'professional_not_working',
      });
    }
    const slots = (await this.scheduling.getAvailableSlots(context, {
      locationId: location.id, professionalId: professional.id, serviceId: service?.id,
      insuranceId: insurance?.id, billingType, dateRange: { from: dateFrom, to: dateTo }, timezone: location.timezone,
    })).slice(0, MAX_SLOT_RESULTS);
    return success(request, {
      location: sanitizeLocation(location), professional: sanitizeProfessional(professional),
      service: service ? sanitizeService(service) : undefined,
      insurance: insurance ? sanitizeInsurance(insurance) : undefined,
      slots: slots.map(sanitizeSlot),
    }, slotOptions(slots, location.timezone));
  }

  private async patientAppointments(request: AiToolExecutionRequest): Promise<AiToolResult> {
    if (!request.context.patientId && !request.context.leadId) {
      throw new AiToolError('AI_TOOL_AUTHORIZATION_DENIED', 'A patient or lead identity is required.');
    }
    const start = this.now();
    start.setUTCDate(start.getUTCDate() - 1);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 366);
    const appointments = (await this.scheduling.listAppointments({ clinicId: request.context.clinicId }, {
      range: { startAt: start.toISOString(), endAt: end.toISOString() },
      patientId: request.context.patientId, leadId: request.context.leadId,
      statuses: ['scheduled'],
    })).slice(0, MAX_APPOINTMENT_RESULTS);
    return success(request, appointments.map(sanitizeAppointment), appointmentOptions(appointments));
  }

  private async resolvePatientAppointment(request: AiToolExecutionRequest, reference?: string): Promise<SchedulingAppointment> {
    if (!request.context.patientId && !request.context.leadId) throw new AiToolError('AI_TOOL_AUTHORIZATION_DENIED', 'A trusted patient or lead identity is required.');
    const start = this.now();
    start.setUTCDate(start.getUTCDate() - 1);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 366);
    const appointments = await this.scheduling.listAppointments({ clinicId: request.context.clinicId }, {
      range: { startAt: start.toISOString(), endAt: end.toISOString() }, patientId: request.context.patientId,
      leadId: request.context.leadId, statuses: ['scheduled'],
    });
    if (reference) {
      const exact = appointments.find((item) => item.id === reference);
      if (exact) return exact;
      const needle = normalized(reference);
      const byDate = appointments.filter((item) => normalized(item.startAt).includes(needle));
      if (byDate.length === 1) return byDate[0];
    }
    if (appointments.length === 1) return appointments[0];
    if (appointments.length > 1) throw ambiguity('appointment');
    throw new AiToolError('AI_TOOL_ENTITY_NOT_FOUND', 'No eligible appointment was found.');
  }

  private async claimMutation(request: AiToolExecutionRequest) {
    if (!(await this.mutationGuard.claim(request.context, request.tool))) {
      throw new AiToolError('AI_TOOL_AUTHORIZATION_DENIED', 'The mutation was not claimed or was already processed.');
    }
  }

  private async assertAvailableSlot(
    context: { clinicId: string },
    input: {
      location: SchedulingLocation;
      professional: SchedulingProfessional;
      service?: SchedulingServiceItem;
      insurance?: SchedulingInsurance;
      billingType: 'private' | 'insurance';
      startAt: string;
    },
  ) {
    const date = dateInTimezone(input.startAt, input.location.timezone);
    const slots = await this.scheduling.getAvailableSlots(context, {
      locationId: input.location.id, professionalId: input.professional.id,
      serviceId: input.service?.id, insuranceId: input.insurance?.id,
      billingType: input.billingType, dateRange: { from: date, to: date }, timezone: input.location.timezone,
    });
    const requested = new Date(input.startAt).getTime();
    if (!slots.some((slot) => new Date(slot.startAt).getTime() === requested)) {
      throw new AiToolError('AI_TOOL_AUTHORIZATION_DENIED', 'The selected slot was not returned by the authoritative availability service.');
    }
  }

  private async resolveLocation(context: { clinicId: string }, name?: string): Promise<SchedulingLocation> {
    const locations = await this.scheduling.listLocations(context, { activeOnly: true });
    if (!name) {
      const primary = locations.find((item) => item.isPrimary) || (locations.length === 1 ? locations[0] : undefined);
      if (primary) return primary;
      throw ambiguity('location');
    }
    return matchOne(locations, name, (item) => item.name, 'location');
  }

  private async resolveOptionalLocation(context: { clinicId: string }, name?: string) {
    return name ? this.resolveLocation(context, name) : undefined;
  }

  private async resolveOptionalProfessional(context: { clinicId: string }, name?: string) {
    if (!name) return undefined;
    const professionals = await this.scheduling.listProfessionals(context, { activeOnly: true });
    return matchOne(professionals, name, (item) => item.fullName, 'professional');
  }

  private async resolveProfessionalForAvailability(context: { clinicId: string }, locationId: string, name?: string, serviceName?: string) {
    const professionals = await this.scheduling.listProfessionals(context, { locationId, activeOnly: true });
    if (name) return matchOne(professionals, name, (item) => item.fullName, 'professional');
    if (serviceName) {
      const eligible: SchedulingProfessional[] = [];
      for (const professional of professionals.slice(0, MAX_CATALOG_RESULTS)) {
        const services = await this.scheduling.listServices(context, { professionalId: professional.id, activeOnly: true });
        if (matchesAny(services, serviceName, (item) => item.name)) eligible.push(professional);
      }
      if (eligible.length === 1) return eligible[0];
    }
    if (professionals.length === 1) return professionals[0];
    throw ambiguity('professional');
  }

  private async resolveOptionalService(context: { clinicId: string }, professionalId: string, name?: string) {
    if (!name) return undefined;
    const services = (await this.scheduling.listServices(context, { professionalId, activeOnly: true })).filter((item) => item.canAiSchedule !== false);
    return matchOne(services, name, (item) => item.name, 'service');
  }

  private async resolveInsurance(context: { clinicId: string }, professionalId: string, name?: string) {
    if (!name) throw new AiToolError('AI_TOOL_INVALID_REQUEST', 'Insurance is required for insured appointments.');
    const insurances = (await this.scheduling.listInsurances(context, { professionalId, activeOnly: true })).filter((item) => item.acceptsNewPatients !== false);
    return matchOne(insurances, name, (item) => item.name, 'insurance');
  }
}

function textArg(args: Readonly<Record<string, unknown>>, name: string): string | undefined {
  const value = args[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isoDateArg(args: Readonly<Record<string, unknown>>, name: string): string {
  const value = textArg(args, name);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AiToolError('AI_TOOL_INVALID_REQUEST', `${name} must be an ISO date.`);
  return value;
}

function isoInstantArg(args: Readonly<Record<string, unknown>>, name: string): string {
  const value = textArg(args, name);
  if (!value || !/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(new Date(value).getTime())) {
    throw new AiToolError('AI_TOOL_INVALID_REQUEST', `${name} must be an ISO instant.`);
  }
  return value;
}

function hoursUntil(value: string, now: Date) {
  return (new Date(value).getTime() - now.getTime()) / 3_600_000;
}

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
}

function matchesAny<T>(items: readonly T[], query: string, label: (item: T) => string) {
  const needle = normalized(query);
  return items.filter((item) => normalized(label(item)).includes(needle) || needle.includes(normalized(label(item))));
}

function matchOne<T>(items: readonly T[], query: string, label: (item: T) => string, entity: string): T {
  const matches = matchesAny(items, query, label);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw ambiguity(entity);
  throw new AiToolError('AI_TOOL_ENTITY_NOT_FOUND', `No matching ${entity} was found.`);
}

function ambiguity(entity: string) {
  return new AiToolError('AI_TOOL_ENTITY_AMBIGUOUS', `More than one ${entity} is eligible.`);
}

function success(request: AiToolExecutionRequest, data: unknown, presentedOptions?: readonly AiPresentedOption[]): AiToolResult {
  return { schemaVersion: 1, toolName: request.tool.name, kind: request.tool.kind, outcome: 'success', data, presentedOptions };
}

function options<T extends { id: string }>(items: readonly T[], kind: AiPresentedOption['kind']): AiPresentedOption[] {
  return items.map((item) => ({ id: item.id, value: item.id, label: 'fullName' in item ? String(item.fullName) : String((item as { name: string }).name), kind }));
}

function slotOptions(slots: readonly SchedulingSlot[], timezone: string): AiPresentedOption[] {
  return slots.map((slot) => ({ id: slot.startAt, value: slot.startAt, label: formatDateTime(slot.startAt, timezone), kind: 'time' }));
}

function appointmentOptions(items: readonly SchedulingAppointment[]): AiPresentedOption[] {
  return items.map((item) => ({ id: item.id, value: item.id, label: formatDateTime(item.startAt, 'America/Sao_Paulo'), kind: 'generic' }));
}

function sanitizeLocation(item: SchedulingLocation) {
  return {
    name: item.name,
    timezone: item.timezone,
    openingHours: item.openingHours?.weekdays,
  };
}
function sanitizeProfessional(item: SchedulingProfessional) { return { name: item.fullName, specialty: item.specialty }; }
function sanitizeService(item: SchedulingServiceItem) {
  return { name: item.name, durationMinutes: item.durationMinutes, price: item.showPrice ? item.privatePrice : undefined };
}
function sanitizeInsurance(item: SchedulingInsurance) {
  return { name: item.name, acceptsNewPatients: item.acceptsNewPatients, requiresAuthorization: item.requiresAuthorization };
}
function sanitizeSlot(item: SchedulingSlot) { return { startAt: item.startAt, endAt: item.endAt, durationMinutes: item.durationMinutes }; }
function sanitizeAppointment(item: SchedulingAppointment) {
  return { reference: item.id, startAt: item.startAt, endAt: item.endAt, status: item.status, confirmationStatus: item.confirmationStatus };
}

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function dateInTimezone(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const pick = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function isoDatesInclusive(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end && dates.length <= 121) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function safeErrorMessage(code: string) {
  if (code === 'AI_TOOL_READ_DISABLED' || code === 'AI_TOOL_MUTATION_DISABLED' || code === 'AI_TOOL_READ_NOT_VALIDATED') return 'Esta operação ainda não está habilitada para a clínica.';
  if (code === 'AI_TOOL_ENTITY_AMBIGUOUS') return 'Encontrei mais de uma opção e preciso que você escolha.';
  if (code === 'AI_TOOL_ENTITY_NOT_FOUND') return 'Não encontrei uma opção correspondente nos cadastros ativos.';
  if (code === 'AI_TOOL_AUTHORIZATION_DENIED') return 'Esta operação precisa ser encaminhada para a recepção.';
  return 'Não consegui consultar a agenda agora. Vou encaminhar para a recepção.';
}
