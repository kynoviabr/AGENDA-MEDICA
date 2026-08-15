import type { SchedulingProviderCapability } from '../domain/capabilities.ts';
import type {
  SchedulingAppointment,
  SchedulingBlock,
  SchedulingInsurance,
  SchedulingLocation,
  SchedulingProfessional,
  SchedulingProfessionalRules,
  SchedulingServiceItem,
  SchedulingSlot,
} from '../domain/models.ts';
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
} from '../domain/inputs.ts';
import {
  normalizeSchedulingError,
  SchedulingCapabilityNotSupportedError,
  SchedulingValidationError,
} from '../errors/SchedulingError.ts';
import type { SchedulingProvider, SchedulingProviderResolver } from '../providers/SchedulingProvider.ts';

type SchedulingProviderDependency = SchedulingProvider | SchedulingProviderResolver;

function isProviderResolver(dependency: SchedulingProviderDependency): dependency is SchedulingProviderResolver {
  return 'resolveProvider' in dependency;
}

export class SchedulingService {
  constructor(private readonly providerDependency: SchedulingProviderDependency) {}

  listLocations(context: SchedulingContext, input: ListLocationsInput = {}): Promise<SchedulingLocation[]> {
    return this.execute(context, 'locations', async (provider) => {
      if (!provider.listLocations) throw new SchedulingCapabilityNotSupportedError(provider.type, 'locations');
      return provider.listLocations(context, input);
    });
  }

  listProfessionals(context: SchedulingContext, input: ListProfessionalsInput = {}): Promise<SchedulingProfessional[]> {
    return this.execute(context, 'professionals', async (provider) => {
      if (!provider.listProfessionals) throw new SchedulingCapabilityNotSupportedError(provider.type, 'professionals');
      return provider.listProfessionals(context, input);
    });
  }

  listServices(context: SchedulingContext, input: ListServicesInput = {}): Promise<SchedulingServiceItem[]> {
    return this.execute(context, 'services', async (provider) => {
      if (!provider.listServices) throw new SchedulingCapabilityNotSupportedError(provider.type, 'services');
      return provider.listServices(context, input);
    });
  }

  listInsurances(context: SchedulingContext, input: ListInsurancesInput = {}): Promise<SchedulingInsurance[]> {
    return this.execute(context, 'insurances', async (provider) => {
      if (!provider.listInsurances) throw new SchedulingCapabilityNotSupportedError(provider.type, 'insurances');
      return provider.listInsurances(context, input);
    });
  }

  getProfessionalRules(context: SchedulingContext, input: GetProfessionalRulesInput): Promise<SchedulingProfessionalRules> {
    return this.execute(context, 'professionalRules', async (provider) => {
      if (!provider.getProfessionalRules) throw new SchedulingCapabilityNotSupportedError(provider.type, 'professionalRules');
      return provider.getProfessionalRules(context, input);
    });
  }

  getAvailableSlots(context: SchedulingContext, input: GetAvailableSlotsInput): Promise<SchedulingSlot[]> {
    return this.execute(context, 'readAvailability', async (provider) => {
      if (!provider.getAvailableSlots) throw new SchedulingCapabilityNotSupportedError(provider.type, 'readAvailability');
      return provider.getAvailableSlots(context, input);
    });
  }

  listAppointments(context: SchedulingContext, input: ListAppointmentsInput): Promise<SchedulingAppointment[]> {
    return this.execute(context, 'readAppointments', async (provider) => {
      if (!provider.listAppointments) throw new SchedulingCapabilityNotSupportedError(provider.type, 'readAppointments');
      return provider.listAppointments(context, input);
    });
  }

  getAppointment(context: SchedulingContext, input: GetAppointmentInput): Promise<SchedulingAppointment> {
    return this.execute(context, 'readAppointments', async (provider) => {
      if (!provider.getAppointment) throw new SchedulingCapabilityNotSupportedError(provider.type, 'readAppointments');
      return provider.getAppointment(context, input);
    });
  }

  createAppointment(context: SchedulingContext, input: CreateAppointmentInput): Promise<SchedulingAppointment> {
    return this.execute(context, 'createAppointment', async (provider) => {
      if (!provider.createAppointment) throw new SchedulingCapabilityNotSupportedError(provider.type, 'createAppointment');
      return provider.createAppointment(context, input);
    });
  }

  confirmAppointment(context: SchedulingContext, input: ConfirmAppointmentInput): Promise<SchedulingAppointment> {
    return this.execute(context, 'confirmAppointment', async (provider) => {
      if (!provider.confirmAppointment) throw new SchedulingCapabilityNotSupportedError(provider.type, 'confirmAppointment');
      return provider.confirmAppointment(context, input);
    });
  }

  cancelAppointment(context: SchedulingContext, input: CancelAppointmentInput): Promise<SchedulingAppointment> {
    return this.execute(context, 'cancelAppointment', async (provider) => {
      if (!provider.cancelAppointment) throw new SchedulingCapabilityNotSupportedError(provider.type, 'cancelAppointment');
      return provider.cancelAppointment(context, input);
    });
  }

  rescheduleAppointment(context: SchedulingContext, input: RescheduleAppointmentInput): Promise<SchedulingAppointment> {
    return this.execute(context, 'rescheduleAppointment', async (provider) => {
      if (!provider.rescheduleAppointment) throw new SchedulingCapabilityNotSupportedError(provider.type, 'rescheduleAppointment');
      return provider.rescheduleAppointment(context, input);
    });
  }

  updateAppointmentStatus(context: SchedulingContext, input: UpdateAppointmentStatusInput): Promise<SchedulingAppointment> {
    return this.execute(context, 'updateAppointmentStatus', async (provider) => {
      if (!provider.updateAppointmentStatus) throw new SchedulingCapabilityNotSupportedError(provider.type, 'updateAppointmentStatus');
      return provider.updateAppointmentStatus(context, input);
    });
  }

  markNoShow(context: SchedulingContext, input: MarkNoShowInput): Promise<SchedulingAppointment> {
    return this.execute(context, 'markNoShow', async (provider) => {
      if (!provider.markNoShow) throw new SchedulingCapabilityNotSupportedError(provider.type, 'markNoShow');
      return provider.markNoShow(context, input);
    });
  }

  reassignProfessional(context: SchedulingContext, input: ReassignProfessionalInput): Promise<SchedulingAppointment> {
    return this.execute(context, 'reassignProfessional', async (provider) => {
      if (!provider.reassignProfessional) throw new SchedulingCapabilityNotSupportedError(provider.type, 'reassignProfessional');
      return provider.reassignProfessional(context, input);
    });
  }

  listBlocks(context: SchedulingContext, input: ListBlocksInput): Promise<SchedulingBlock[]> {
    return this.execute(context, 'readBlocks', async (provider) => {
      if (!provider.listBlocks) throw new SchedulingCapabilityNotSupportedError(provider.type, 'readBlocks');
      return provider.listBlocks(context, input);
    });
  }

  createBlock(context: SchedulingContext, input: CreateBlockInput): Promise<SchedulingBlock> {
    return this.execute(context, 'createBlock', async (provider) => {
      if (!provider.createBlock) throw new SchedulingCapabilityNotSupportedError(provider.type, 'createBlock');
      return provider.createBlock(context, input);
    });
  }

  removeBlock(context: SchedulingContext, input: RemoveBlockInput): Promise<void> {
    return this.execute(context, 'removeBlock', async (provider) => {
      if (!provider.removeBlock) throw new SchedulingCapabilityNotSupportedError(provider.type, 'removeBlock');
      return provider.removeBlock(context, input);
    });
  }

  private async resolveProvider(context: SchedulingContext): Promise<SchedulingProvider> {
    this.validateContext(context);
    return isProviderResolver(this.providerDependency)
      ? this.providerDependency.resolveProvider(context)
      : this.providerDependency;
  }

  private validateContext(context: SchedulingContext): void {
    if (!context?.clinicId?.trim()) {
      throw new SchedulingValidationError('SchedulingContext.clinicId is required.');
    }
  }

  private async execute<T>(
    context: SchedulingContext,
    capability: SchedulingProviderCapability,
    operation: (provider: SchedulingProvider) => Promise<T>,
  ): Promise<T> {
    const provider = await this.resolveProvider(context);
    if (!provider.capabilities[capability]) {
      throw new SchedulingCapabilityNotSupportedError(provider.type, capability);
    }

    try {
      return await operation(provider);
    } catch (error) {
      throw normalizeSchedulingError(error, provider.type);
    }
  }
}
