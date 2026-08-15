import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../integrations/supabase/types';
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
import { mapDomainStatusesToInternal } from './internalSchedulingMappers';
import type {
  InternalAppointmentRecord,
  InternalBlockRecord,
  InternalInsuranceRecord,
  InternalLocationRecord,
  InternalProfessionalRecord,
  InternalProfessionalRulesRecord,
  InternalSchedulingDataSource,
  InternalServiceRecord,
  InternalSlotRecord,
} from './InternalSchedulingDataSource';

interface SupabaseResult {
  data: unknown;
  error: unknown;
}

interface InternalSupabaseQuery extends PromiseLike<SupabaseResult> {
  select(columns?: string): InternalSupabaseQuery;
  insert(values: unknown): InternalSupabaseQuery;
  update(values: unknown): InternalSupabaseQuery;
  delete(): InternalSupabaseQuery;
  eq(column: string, value: unknown): InternalSupabaseQuery;
  in(column: string, values: readonly unknown[]): InternalSupabaseQuery;
  gte(column: string, value: unknown): InternalSupabaseQuery;
  gt(column: string, value: unknown): InternalSupabaseQuery;
  lt(column: string, value: unknown): InternalSupabaseQuery;
  order(column: string, options?: { ascending?: boolean }): InternalSupabaseQuery;
  maybeSingle(): InternalSupabaseQuery;
  single(): InternalSupabaseQuery;
}

export interface InternalSupabaseClientLike {
  from(table: string): InternalSupabaseQuery;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<SupabaseResult>;
}

type BrowserSupabaseClient = SupabaseClient<Database>;

const appointmentColumns = [
  'id',
  'clinic_id',
  'location_id',
  'professional_id',
  'patient_id',
  'lead_id',
  'treatment_id',
  'health_insurance_id',
  'billing_type',
  'appointment_type',
  'start_time',
  'end_time',
  'duration_minutes',
  'status',
  'confirmed_at',
  'notes',
  'cancelled_reason',
  'no_show_reason',
  'rescheduled_from',
  'rescheduled_to',
].join(',');

async function unwrap<T>(request: PromiseLike<SupabaseResult>): Promise<T> {
  const { data, error } = await request;
  if (error) throw error;
  return data as T;
}

function asSingleRecord<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] || null : value;
}

export class SupabaseInternalSchedulingDataSource implements InternalSchedulingDataSource {
  private readonly client: InternalSupabaseClientLike;

  constructor(client: BrowserSupabaseClient | InternalSupabaseClientLike) {
    this.client = client as unknown as InternalSupabaseClientLike;
  }

  async listLocations(context: SchedulingContext, input: ListLocationsInput): Promise<InternalLocationRecord[]> {
    let query = this.client.from('clinic_locations')
      .select('id,name,timezone,active,is_primary')
      .eq('clinic_id', context.clinicId);
    if (input.activeOnly) query = query.eq('active', true);
    return unwrap<InternalLocationRecord[]>(query.order('is_primary', { ascending: false }).order('name'));
  }

  async listProfessionals(context: SchedulingContext, input: ListProfessionalsInput): Promise<InternalProfessionalRecord[]> {
    let professionalIds: string[] | undefined;
    if (input.locationId) {
      const links = await unwrap<Array<{ professional_id: string }>>(this.client.from('professional_locations')
        .select('professional_id')
        .eq('clinic_id', context.clinicId)
        .eq('location_id', input.locationId)
        .eq('active', true));
      professionalIds = links.map((link) => link.professional_id);
      if (professionalIds.length === 0) return [];
    }

    let query = this.client.from('professionals')
      .select('id,full_name,specialty,status')
      .eq('clinic_id', context.clinicId);
    if (input.activeOnly) query = query.eq('status', 'active');
    if (professionalIds) query = query.in('id', professionalIds);
    return unwrap<InternalProfessionalRecord[]>(query.order('full_name'));
  }

  async listServices(context: SchedulingContext, input: ListServicesInput): Promise<InternalServiceRecord[]> {
    if (!input.professionalId) {
      let query = this.client.from('treatments')
        .select('id,name,duration_minutes,is_active,can_be_scheduled_by_ai,show_price_to_ai,price,requires_evaluation')
        .eq('clinic_id', context.clinicId);
      if (input.activeOnly) query = query.eq('is_active', true);
      const rows = await unwrap<Array<{
        id: string;
        name: string;
        duration_minutes: number;
        is_active: boolean;
        can_be_scheduled_by_ai: boolean;
        show_price_to_ai: boolean;
        price: number;
        requires_evaluation: boolean;
      }>>(query.order('name'));
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        duration_minutes: row.duration_minutes,
        is_active: row.is_active,
        can_ai_schedule: row.can_be_scheduled_by_ai,
        show_price: row.show_price_to_ai,
        private_price: row.price,
        requires_previous_evaluation: row.requires_evaluation,
      }));
    }

    let query = this.client.from('professional_treatments')
      .select('status,duration_minutes,private_price,show_price,can_ai_schedule,requires_previous_evaluation,treatments!inner(id,name,duration_minutes,is_active,can_be_scheduled_by_ai,show_price_to_ai,price,requires_evaluation)')
      .eq('clinic_id', context.clinicId)
      .eq('professional_id', input.professionalId);
    if (input.activeOnly) query = query.eq('status', 'active').eq('treatments.is_active', true);
    const links = await unwrap<Array<{
      status: string;
      duration_minutes: number | null;
      private_price: number | null;
      show_price: boolean | null;
      can_ai_schedule: boolean | null;
      requires_previous_evaluation: boolean | null;
      treatments: {
        id: string;
        name: string;
        duration_minutes: number;
        is_active: boolean;
        can_be_scheduled_by_ai: boolean;
        show_price_to_ai: boolean;
        price: number;
        requires_evaluation: boolean;
      };
    }>>(query.order('created_at'));
    return links.map((link) => ({
      id: link.treatments.id,
      name: link.treatments.name,
      duration_minutes: link.duration_minutes ?? link.treatments.duration_minutes,
      is_active: link.status === 'active' && link.treatments.is_active,
      can_ai_schedule: link.can_ai_schedule ?? link.treatments.can_be_scheduled_by_ai,
      show_price: link.show_price ?? link.treatments.show_price_to_ai,
      private_price: link.private_price ?? link.treatments.price,
      requires_previous_evaluation: link.requires_previous_evaluation ?? link.treatments.requires_evaluation,
    }));
  }

  async listInsurances(context: SchedulingContext, input: ListInsurancesInput): Promise<InternalInsuranceRecord[]> {
    if (!input.professionalId) {
      let query = this.client.from('health_insurances')
        .select('id,name,status,authorization_notes')
        .eq('clinic_id', context.clinicId);
      if (input.activeOnly) query = query.eq('status', 'active');
      const rows = await unwrap<Array<{ id: string; name: string; status: string; authorization_notes: string | null }>>(query.order('name'));
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        accepts_new_patients: null,
        authorization_required: null,
        appointment_duration_minutes: null,
        ai_instructions: null,
        notes: row.authorization_notes,
      }));
    }

    let query = this.client.from('professional_health_insurances')
      .select('status,accepts_new_patients,authorization_required,appointment_duration_minutes,ai_instructions,notes,health_insurances!inner(id,name,status,authorization_notes)')
      .eq('clinic_id', context.clinicId)
      .eq('professional_id', input.professionalId);
    if (input.activeOnly) query = query.eq('status', 'active').eq('health_insurances.status', 'active');
    const links = await unwrap<Array<{
      status: string;
      accepts_new_patients: boolean;
      authorization_required: boolean;
      appointment_duration_minutes: number;
      ai_instructions: string | null;
      notes: string | null;
      health_insurances: { id: string; name: string; status: string; authorization_notes: string | null };
    }>>(query.order('created_at'));
    return links.map((link) => ({
      id: link.health_insurances.id,
      name: link.health_insurances.name,
      status: link.status === 'active' ? link.health_insurances.status : 'inactive',
      accepts_new_patients: link.accepts_new_patients,
      authorization_required: link.authorization_required,
      appointment_duration_minutes: link.appointment_duration_minutes,
      ai_instructions: link.ai_instructions,
      notes: link.notes || link.health_insurances.authorization_notes,
    }));
  }

  getProfessionalRules(context: SchedulingContext, input: GetProfessionalRulesInput): Promise<InternalProfessionalRulesRecord | null> {
    return unwrap<InternalProfessionalRulesRecord | null>(this.client.from('professional_settings')
      .select('professional_id,accept_new_patients,allow_ai_booking,allow_ai_cancellation,allow_ai_rescheduling,allow_waitlist,minimum_booking_notice_hours,maximum_booking_days,cancellation_notice_hours,default_appointment_duration_minutes,private_appointment_duration_minutes')
      .eq('clinic_id', context.clinicId)
      .eq('professional_id', input.professionalId)
      .maybeSingle());
  }

  getAvailableSlots(context: SchedulingContext, input: GetAvailableSlotsInput): Promise<InternalSlotRecord[]> {
    return unwrap<InternalSlotRecord[]>(this.client.rpc('get_available_slots', {
      p_clinic_id: context.clinicId,
      p_location_id: input.locationId,
      p_professional_id: input.professionalId,
      p_treatment_id: input.serviceId || null,
      p_date_from: input.dateRange.from,
      p_date_to: input.dateRange.to,
      p_step_minutes: input.stepMinutes ?? 15,
      p_billing_type: input.billingType || 'private',
      p_health_insurance_id: input.billingType === 'insurance' ? input.insuranceId || null : null,
    }));
  }

  async listAppointments(context: SchedulingContext, input: ListAppointmentsInput): Promise<InternalAppointmentRecord[]> {
    let query = this.client.from('appointments')
      .select(appointmentColumns)
      .eq('clinic_id', context.clinicId)
      .gte('start_time', input.range.startAt)
      .lt('start_time', input.range.endAt);
    if (input.locationId) query = query.eq('location_id', input.locationId);
    if (input.professionalId) query = query.eq('professional_id', input.professionalId);
    if (input.patientId) query = query.eq('patient_id', input.patientId);
    if (input.leadId) query = query.eq('lead_id', input.leadId);
    if (input.statuses?.length) query = query.in('status', mapDomainStatusesToInternal(input.statuses));
    return unwrap<InternalAppointmentRecord[]>(query.order('start_time'));
  }

  getAppointment(context: SchedulingContext, input: GetAppointmentInput): Promise<InternalAppointmentRecord | null> {
    return unwrap<InternalAppointmentRecord | null>(this.client.from('appointments')
      .select(appointmentColumns)
      .eq('clinic_id', context.clinicId)
      .eq('id', input.appointmentId)
      .maybeSingle());
  }

  async createAppointment(context: SchedulingContext, input: CreateAppointmentInput): Promise<InternalAppointmentRecord> {
    const result = await unwrap<InternalAppointmentRecord | InternalAppointmentRecord[] | null>(this.client.rpc('create_appointment_secure', {
      p_clinic_id: context.clinicId,
      p_location_id: input.locationId,
      p_professional_id: input.professionalId,
      p_patient_id: input.patientId || null,
      p_lead_id: input.leadId || null,
      p_treatment_id: input.serviceId || null,
      p_start_time: input.startAt,
      p_appointment_type: input.appointmentType,
      p_notes: input.notes || null,
      p_duration_minutes: input.durationMinutes ?? null,
      p_contract_id: null,
      p_contract_item_id: null,
      p_billing_type: input.billingType,
      p_health_insurance_id: input.billingType === 'insurance' ? input.insuranceId || null : null,
    }));
    return asSingleRecord(result) as InternalAppointmentRecord;
  }

  async confirmAppointment(context: SchedulingContext, input: ConfirmAppointmentInput): Promise<InternalAppointmentRecord> {
    const result = await unwrap<InternalAppointmentRecord | InternalAppointmentRecord[] | null>(this.client.rpc('confirm_appointment_secure', {
      p_clinic_id: context.clinicId,
      p_appointment_id: input.appointmentId,
    }));
    return asSingleRecord(result) as InternalAppointmentRecord;
  }

  async cancelAppointment(context: SchedulingContext, input: CancelAppointmentInput): Promise<InternalAppointmentRecord> {
    const result = await unwrap<InternalAppointmentRecord | InternalAppointmentRecord[] | null>(this.client.rpc('cancel_appointment_secure', {
      p_clinic_id: context.clinicId,
      p_appointment_id: input.appointmentId,
      p_reason: input.reason,
      p_status: 'cancelled',
    }));
    return asSingleRecord(result) as InternalAppointmentRecord;
  }

  async rescheduleAppointment(context: SchedulingContext, input: RescheduleAppointmentInput): Promise<InternalAppointmentRecord> {
    const result = await unwrap<InternalAppointmentRecord | InternalAppointmentRecord[] | null>(this.client.rpc('reschedule_appointment_secure', {
      p_clinic_id: context.clinicId,
      p_appointment_id: input.appointmentId,
      p_start_time: input.startAt,
      p_professional_id: input.professionalId || null,
      p_location_id: input.locationId || null,
      p_notes: input.notes || null,
      p_duration_minutes: input.durationMinutes ?? null,
      p_reason: input.reason || 'Remarcado',
    }));
    return asSingleRecord(result) as InternalAppointmentRecord;
  }

  async updateAppointmentStatus(context: SchedulingContext, input: UpdateAppointmentStatusInput): Promise<InternalAppointmentRecord> {
    const result = await unwrap<InternalAppointmentRecord | InternalAppointmentRecord[] | null>(this.client.rpc('transition_appointment_status_secure', {
      p_clinic_id: context.clinicId,
      p_appointment_id: input.appointmentId,
      p_status: input.status,
    }));
    return asSingleRecord(result) as InternalAppointmentRecord;
  }

  async markNoShow(context: SchedulingContext, input: MarkNoShowInput): Promise<InternalAppointmentRecord> {
    const result = await unwrap<InternalAppointmentRecord | InternalAppointmentRecord[] | null>(this.client.rpc('cancel_appointment_secure', {
      p_clinic_id: context.clinicId,
      p_appointment_id: input.appointmentId,
      p_reason: input.reason || 'Não compareceu',
      p_status: 'no_show',
    }));
    return asSingleRecord(result) as InternalAppointmentRecord;
  }

  async reassignProfessional(context: SchedulingContext, input: ReassignProfessionalInput): Promise<InternalAppointmentRecord> {
    const result = await unwrap<InternalAppointmentRecord | InternalAppointmentRecord[] | null>(this.client.rpc('reassign_appointment_professional_secure', {
      p_clinic_id: context.clinicId,
      p_appointment_id: input.appointmentId,
      p_professional_id: input.professionalId,
    }));
    return asSingleRecord(result) as InternalAppointmentRecord;
  }

  async listBlocks(context: SchedulingContext, input: ListBlocksInput): Promise<InternalBlockRecord[]> {
    let query = this.client.from('appointment_blocks')
      .select('id,location_id,professional_id,start_at,end_at,reason,notes')
      .eq('clinic_id', context.clinicId)
      .lt('start_at', input.range.endAt)
      .gt('end_at', input.range.startAt);
    if (input.locationId) query = query.eq('location_id', input.locationId);
    if (input.professionalId) query = query.eq('professional_id', input.professionalId);
    return unwrap<InternalBlockRecord[]>(query.order('start_at'));
  }

  createBlock(context: SchedulingContext, input: CreateBlockInput): Promise<InternalBlockRecord> {
    return unwrap<InternalBlockRecord>(this.client.from('appointment_blocks')
      .insert({
        clinic_id: context.clinicId,
        location_id: input.locationId || null,
        professional_id: input.professionalId || null,
        start_at: input.startAt,
        end_at: input.endAt,
        reason: input.reason || null,
        notes: input.notes || null,
      })
      .select('id,location_id,professional_id,start_at,end_at,reason,notes')
      .single());
  }

  async removeBlock(context: SchedulingContext, input: RemoveBlockInput): Promise<boolean> {
    const row = await unwrap<{ id: string } | null>(this.client.from('appointment_blocks')
      .delete()
      .eq('clinic_id', context.clinicId)
      .eq('id', input.blockId)
      .select('id')
      .maybeSingle());
    return Boolean(row);
  }
}
