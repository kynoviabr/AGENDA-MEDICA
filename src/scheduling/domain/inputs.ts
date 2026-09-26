import type {
  SchedulingAppointmentStatus,
  SchedulingAppointmentType,
  SchedulingBillingType,
  SchedulingSource,
} from './models.ts';
import type { DateRange, IanaTimezone, IsoInstant, TimeRange } from './time.ts';

export interface SchedulingContext {
  clinicId: string;
}

export interface ListLocationsInput {
  activeOnly?: boolean;
}

export interface ListProfessionalsInput {
  locationId?: string;
  activeOnly?: boolean;
}

export interface ListServicesInput {
  professionalId?: string;
  activeOnly?: boolean;
}

export interface ListInsurancesInput {
  professionalId?: string;
  activeOnly?: boolean;
}

export interface GetProfessionalRulesInput {
  professionalId: string;
}

export interface GetAvailableSlotsInput {
  locationId: string;
  professionalId: string;
  serviceId?: string;
  insuranceId?: string;
  billingType?: SchedulingBillingType;
  dateRange: DateRange;
  timezone?: IanaTimezone;
  stepMinutes?: number;
}

export interface ListAppointmentsInput {
  range: TimeRange;
  locationId?: string;
  professionalId?: string;
  patientId?: string;
  leadId?: string;
  statuses?: readonly SchedulingAppointmentStatus[];
}

export interface GetAppointmentInput {
  appointmentId: string;
}

export interface CreateAppointmentInput {
  locationId: string;
  professionalId: string;
  patientId?: string;
  leadId?: string;
  serviceId?: string;
  insuranceId?: string;
  billingType: SchedulingBillingType;
  appointmentType: SchedulingAppointmentType;
  startAt: IsoInstant;
  durationMinutes?: number;
  timezone?: IanaTimezone;
  source?: SchedulingSource;
  notes?: string;
}

export interface ConfirmAppointmentInput {
  appointmentId: string;
}

export interface CancelAppointmentInput {
  appointmentId: string;
  reason: string;
}

export interface RescheduleAppointmentInput {
  appointmentId: string;
  startAt: IsoInstant;
  locationId?: string;
  professionalId?: string;
  durationMinutes?: number;
  timezone?: IanaTimezone;
  reason?: string;
  notes?: string;
}

export interface UpdateAppointmentStatusInput {
  appointmentId: string;
  status: Extract<SchedulingAppointmentStatus, 'scheduled' | 'in_progress' | 'completed'>;
}

export interface MarkNoShowInput {
  appointmentId: string;
  reason?: string;
}

export interface ReassignProfessionalInput {
  appointmentId: string;
  professionalId: string;
}

export interface ListBlocksInput {
  range: TimeRange;
  locationId?: string;
  professionalId?: string;
}

export interface CreateBlockInput extends TimeRange {
  locationId?: string;
  professionalId?: string;
  reason?: string;
  notes?: string;
}

export interface RemoveBlockInput {
  blockId: string;
}
