import { createSchedulingProviderCapabilities } from '../../domain/capabilities.ts';
import type {
  CancelAppointmentInput,
  ConfirmAppointmentInput,
  CreateAppointmentInput,
  CreateBlockInput,
  GetAppointmentInput,
  GetAvailableSlotsInput,
  GetProfessionalRulesInput,
  ListAppointmentsInput,
  ListBlocksInput,
  ListInsurancesInput,
  ListLocationsInput,
  ListProfessionalsInput,
  ListServicesInput,
  MarkNoShowInput,
  ReassignProfessionalInput,
  RemoveBlockInput,
  RescheduleAppointmentInput,
  SchedulingContext,
  UpdateAppointmentStatusInput,
} from '../../domain/inputs.ts';
import type {
  SchedulingAppointment,
  SchedulingBlock,
  SchedulingInsurance,
  SchedulingLocation,
  SchedulingProfessional,
  SchedulingProfessionalRules,
  SchedulingServiceItem,
  SchedulingSlot,
} from '../../domain/models.ts';
import { SchedulingNotFoundError, SchedulingValidationError } from '../../errors/SchedulingError.ts';
import type { SchedulingProvider } from '../SchedulingProvider.ts';
import type { InternalAppointmentRecord, InternalSchedulingDataSource } from './InternalSchedulingDataSource.ts';
import { mapInternalSchedulingError } from './internalSchedulingErrors.ts';
import {
  mapInternalAppointment,
  mapInternalBlock,
  mapInternalInsurance,
  mapInternalLocation,
  mapInternalProfessional,
  mapInternalProfessionalRules,
  mapInternalService,
  mapInternalSlot,
} from './internalSchedulingMappers.ts';

export const internalSchedulingCapabilities = createSchedulingProviderCapabilities([
  'locations',
  'professionals',
  'services',
  'insurances',
  'professionalRules',
  'readAvailability',
  'readAppointments',
  'createAppointment',
  'confirmAppointment',
  'cancelAppointment',
  'rescheduleAppointment',
  'updateAppointmentStatus',
  'markNoShow',
  'reassignProfessional',
  'readBlocks',
  'createBlock',
  'removeBlock',
]);

interface InternalSchedulingProviderOptions {
  dataSource: InternalSchedulingDataSource;
}

export class InternalSchedulingProvider implements SchedulingProvider {
  readonly type = 'internal' as const;
  readonly name = 'Aura Internal Scheduling';
  readonly capabilities = internalSchedulingCapabilities;

  private readonly dataSource: InternalSchedulingDataSource;

  constructor(options: InternalSchedulingProviderOptions) {
    this.dataSource = options.dataSource;
  }

  listLocations(context: SchedulingContext, input: ListLocationsInput = {}): Promise<SchedulingLocation[]> {
    return this.run(context, async () => (await this.dataSource.listLocations(context, input)).map(mapInternalLocation));
  }

  listProfessionals(context: SchedulingContext, input: ListProfessionalsInput = {}): Promise<SchedulingProfessional[]> {
    return this.run(context, async () => (await this.dataSource.listProfessionals(context, input)).map(mapInternalProfessional));
  }

  listServices(context: SchedulingContext, input: ListServicesInput = {}): Promise<SchedulingServiceItem[]> {
    return this.run(context, async () => (await this.dataSource.listServices(context, input)).map(mapInternalService));
  }

  listInsurances(context: SchedulingContext, input: ListInsurancesInput = {}): Promise<SchedulingInsurance[]> {
    return this.run(context, async () => (await this.dataSource.listInsurances(context, input)).map(mapInternalInsurance));
  }

  getProfessionalRules(context: SchedulingContext, input: GetProfessionalRulesInput): Promise<SchedulingProfessionalRules> {
    return this.run(context, async () => {
      const record = await this.dataSource.getProfessionalRules(context, input);
      if (!record) throw new SchedulingNotFoundError('Professional scheduling rules were not found.', 'internal');
      return mapInternalProfessionalRules(record);
    });
  }

  getAvailableSlots(context: SchedulingContext, input: GetAvailableSlotsInput): Promise<SchedulingSlot[]> {
    return this.run(context, async () => (await this.dataSource.getAvailableSlots(context, input))
      .map((record) => mapInternalSlot(record, input.locationId, input.professionalId)));
  }

  listAppointments(context: SchedulingContext, input: ListAppointmentsInput): Promise<SchedulingAppointment[]> {
    return this.run(context, async () => (await this.dataSource.listAppointments(context, input)).map(mapInternalAppointment));
  }

  getAppointment(context: SchedulingContext, input: GetAppointmentInput): Promise<SchedulingAppointment> {
    return this.run(context, async () => mapInternalAppointment(await this.requireAppointment(context, input)));
  }

  createAppointment(context: SchedulingContext, input: CreateAppointmentInput): Promise<SchedulingAppointment> {
    return this.run(context, async () => mapInternalAppointment(
      this.requireMutationResult(await this.dataSource.createAppointment(context, input)),
    ));
  }

  confirmAppointment(context: SchedulingContext, input: ConfirmAppointmentInput): Promise<SchedulingAppointment> {
    return this.run(context, async () => {
      await this.requireAppointment(context, input);
      const record = await this.dataSource.confirmAppointment(context, input);
      return mapInternalAppointment(record);
    });
  }

  cancelAppointment(context: SchedulingContext, input: CancelAppointmentInput): Promise<SchedulingAppointment> {
    return this.run(context, async () => {
      await this.requireAppointment(context, input);
      return mapInternalAppointment(this.requireMutationResult(await this.dataSource.cancelAppointment(context, input)));
    });
  }

  rescheduleAppointment(context: SchedulingContext, input: RescheduleAppointmentInput): Promise<SchedulingAppointment> {
    return this.run(context, async () => {
      await this.requireAppointment(context, input);
      return mapInternalAppointment(this.requireMutationResult(await this.dataSource.rescheduleAppointment(context, input)));
    });
  }

  updateAppointmentStatus(context: SchedulingContext, input: UpdateAppointmentStatusInput): Promise<SchedulingAppointment> {
    return this.run(context, async () => {
      await this.requireAppointment(context, input);
      const record = await this.dataSource.updateAppointmentStatus(context, input);
      return mapInternalAppointment(record);
    });
  }

  markNoShow(context: SchedulingContext, input: MarkNoShowInput): Promise<SchedulingAppointment> {
    return this.run(context, async () => {
      await this.requireAppointment(context, input);
      return mapInternalAppointment(this.requireMutationResult(await this.dataSource.markNoShow(context, input)));
    });
  }

  reassignProfessional(context: SchedulingContext, input: ReassignProfessionalInput): Promise<SchedulingAppointment> {
    return this.run(context, async () => {
      await this.requireAppointment(context, input);
      return mapInternalAppointment(this.requireMutationResult(await this.dataSource.reassignProfessional(context, input)));
    });
  }

  listBlocks(context: SchedulingContext, input: ListBlocksInput): Promise<SchedulingBlock[]> {
    return this.run(context, async () => (await this.dataSource.listBlocks(context, input)).map(mapInternalBlock));
  }

  createBlock(context: SchedulingContext, input: CreateBlockInput): Promise<SchedulingBlock> {
    return this.run(context, async () => mapInternalBlock(await this.dataSource.createBlock(context, input)));
  }

  removeBlock(context: SchedulingContext, input: RemoveBlockInput): Promise<void> {
    return this.run(context, async () => {
      const removed = await this.dataSource.removeBlock(context, input);
      if (!removed) throw new SchedulingNotFoundError('Scheduling block was not found.', 'internal');
    });
  }

  private async requireAppointment(
    context: SchedulingContext,
    input: { appointmentId: string },
  ): Promise<InternalAppointmentRecord> {
    const record = await this.dataSource.getAppointment(context, input);
    if (!record) throw new SchedulingNotFoundError('Appointment was not found in this clinic.', 'internal');
    return record;
  }

  private requireMutationResult(record: InternalAppointmentRecord | null | undefined): InternalAppointmentRecord {
    if (!record) throw new SchedulingNotFoundError('The internal scheduling operation returned no appointment.', 'internal');
    return record;
  }

  private async run<T>(context: SchedulingContext, operation: () => Promise<T>): Promise<T> {
    if (!context?.clinicId?.trim()) {
      throw new SchedulingValidationError('SchedulingContext.clinicId is required.', 'internal');
    }

    try {
      return await operation();
    } catch (error) {
      throw mapInternalSchedulingError(error);
    }
  }
}
