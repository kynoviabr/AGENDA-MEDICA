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
} from '../../domain/inputs';

export interface InternalLocationRecord {
  id: string;
  name: string;
  timezone: string;
  active: boolean;
  is_primary: boolean;
}

export interface InternalProfessionalRecord {
  id: string;
  full_name: string;
  specialty: string | null;
  status: string;
}

export interface InternalServiceRecord {
  id: string;
  name: string;
  duration_minutes: number | null;
  is_active: boolean;
  can_ai_schedule: boolean | null;
  show_price: boolean | null;
  private_price: number | null;
  requires_previous_evaluation: boolean | null;
}

export interface InternalInsuranceRecord {
  id: string;
  name: string;
  status: string;
  accepts_new_patients: boolean | null;
  authorization_required: boolean | null;
  appointment_duration_minutes: number | null;
  ai_instructions: string | null;
  notes: string | null;
}

export interface InternalProfessionalRulesRecord {
  professional_id: string;
  accept_new_patients: boolean;
  allow_ai_booking: boolean;
  allow_ai_cancellation: boolean;
  allow_ai_rescheduling: boolean;
  allow_waitlist: boolean;
  minimum_booking_notice_hours: number;
  maximum_booking_days: number;
  cancellation_notice_hours: number;
  default_appointment_duration_minutes: number;
  private_appointment_duration_minutes: number;
}

export interface InternalSlotRecord {
  start_time: string;
  end_time: string;
  duration_minutes: number;
}

export type InternalAppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export interface InternalAppointmentRecord {
  id: string;
  clinic_id: string;
  location_id: string | null;
  professional_id: string | null;
  patient_id: string | null;
  lead_id: string | null;
  treatment_id: string | null;
  health_insurance_id: string | null;
  billing_type: string;
  appointment_type: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: InternalAppointmentStatus;
  confirmed_at: string | null;
  notes: string | null;
  cancelled_reason: string | null;
  no_show_reason: string | null;
  rescheduled_from: string | null;
  rescheduled_to: string | null;
}

export interface InternalBlockRecord {
  id: string;
  location_id: string | null;
  professional_id: string | null;
  start_at: string;
  end_at: string;
  reason: string | null;
  notes: string | null;
}

export interface InternalSchedulingDataSource {
  listLocations(context: SchedulingContext, input: ListLocationsInput): Promise<InternalLocationRecord[]>;
  listProfessionals(context: SchedulingContext, input: ListProfessionalsInput): Promise<InternalProfessionalRecord[]>;
  listServices(context: SchedulingContext, input: ListServicesInput): Promise<InternalServiceRecord[]>;
  listInsurances(context: SchedulingContext, input: ListInsurancesInput): Promise<InternalInsuranceRecord[]>;
  getProfessionalRules(context: SchedulingContext, input: GetProfessionalRulesInput): Promise<InternalProfessionalRulesRecord | null>;
  getAvailableSlots(context: SchedulingContext, input: GetAvailableSlotsInput): Promise<InternalSlotRecord[]>;
  listAppointments(context: SchedulingContext, input: ListAppointmentsInput): Promise<InternalAppointmentRecord[]>;
  getAppointment(context: SchedulingContext, input: GetAppointmentInput): Promise<InternalAppointmentRecord | null>;
  createAppointment(context: SchedulingContext, input: CreateAppointmentInput): Promise<InternalAppointmentRecord>;
  confirmAppointment(context: SchedulingContext, input: ConfirmAppointmentInput): Promise<InternalAppointmentRecord>;
  cancelAppointment(context: SchedulingContext, input: CancelAppointmentInput): Promise<InternalAppointmentRecord>;
  rescheduleAppointment(context: SchedulingContext, input: RescheduleAppointmentInput): Promise<InternalAppointmentRecord>;
  updateAppointmentStatus(context: SchedulingContext, input: UpdateAppointmentStatusInput): Promise<InternalAppointmentRecord>;
  markNoShow(context: SchedulingContext, input: MarkNoShowInput): Promise<InternalAppointmentRecord>;
  reassignProfessional(context: SchedulingContext, input: ReassignProfessionalInput): Promise<InternalAppointmentRecord>;
  listBlocks(context: SchedulingContext, input: ListBlocksInput): Promise<InternalBlockRecord[]>;
  createBlock(context: SchedulingContext, input: CreateBlockInput): Promise<InternalBlockRecord>;
  removeBlock(context: SchedulingContext, input: RemoveBlockInput): Promise<boolean>;
}
