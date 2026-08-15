import type { SchedulingProviderCapabilities } from '../domain/capabilities';
import type {
  SchedulingAppointment,
  SchedulingBlock,
  SchedulingInsurance,
  SchedulingLocation,
  SchedulingProfessional,
  SchedulingProfessionalRules,
  SchedulingProviderType,
  SchedulingServiceItem,
  SchedulingSlot,
} from '../domain/models';
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
} from '../domain/inputs';

export interface SchedulingCatalogOperations {
  listLocations(context: SchedulingContext, input: ListLocationsInput): Promise<SchedulingLocation[]>;
  listProfessionals(context: SchedulingContext, input: ListProfessionalsInput): Promise<SchedulingProfessional[]>;
  listServices(context: SchedulingContext, input: ListServicesInput): Promise<SchedulingServiceItem[]>;
  listInsurances(context: SchedulingContext, input: ListInsurancesInput): Promise<SchedulingInsurance[]>;
  getProfessionalRules(context: SchedulingContext, input: GetProfessionalRulesInput): Promise<SchedulingProfessionalRules>;
}

export interface SchedulingAvailabilityOperations {
  getAvailableSlots(context: SchedulingContext, input: GetAvailableSlotsInput): Promise<SchedulingSlot[]>;
}

export interface SchedulingAppointmentOperations {
  listAppointments(context: SchedulingContext, input: ListAppointmentsInput): Promise<SchedulingAppointment[]>;
  getAppointment(context: SchedulingContext, input: GetAppointmentInput): Promise<SchedulingAppointment>;
  createAppointment(context: SchedulingContext, input: CreateAppointmentInput): Promise<SchedulingAppointment>;
  confirmAppointment(context: SchedulingContext, input: ConfirmAppointmentInput): Promise<SchedulingAppointment>;
  cancelAppointment(context: SchedulingContext, input: CancelAppointmentInput): Promise<SchedulingAppointment>;
  rescheduleAppointment(context: SchedulingContext, input: RescheduleAppointmentInput): Promise<SchedulingAppointment>;
  updateAppointmentStatus(context: SchedulingContext, input: UpdateAppointmentStatusInput): Promise<SchedulingAppointment>;
  markNoShow(context: SchedulingContext, input: MarkNoShowInput): Promise<SchedulingAppointment>;
  reassignProfessional(context: SchedulingContext, input: ReassignProfessionalInput): Promise<SchedulingAppointment>;
}

export interface SchedulingBlockOperations {
  listBlocks(context: SchedulingContext, input: ListBlocksInput): Promise<SchedulingBlock[]>;
  createBlock(context: SchedulingContext, input: CreateBlockInput): Promise<SchedulingBlock>;
  removeBlock(context: SchedulingContext, input: RemoveBlockInput): Promise<void>;
}

export type SchedulingProvider = {
  readonly type: SchedulingProviderType;
  readonly name: string;
  readonly capabilities: SchedulingProviderCapabilities;
} & Partial<SchedulingCatalogOperations>
  & Partial<SchedulingAvailabilityOperations>
  & Partial<SchedulingAppointmentOperations>
  & Partial<SchedulingBlockOperations>;

/** Future provider selection can use tenant/professional configuration behind this boundary. */
export interface SchedulingProviderResolver {
  resolveProvider(context: SchedulingContext): SchedulingProvider | Promise<SchedulingProvider>;
}
