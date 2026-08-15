import { describe, expect, it, vi } from 'vitest';
import {
  SupabaseInternalSchedulingDataSource,
  type InternalSupabaseClientLike,
} from '@/scheduling';

type QueryResult = { data: unknown; error: unknown };

class QueryDouble implements PromiseLike<QueryResult> {
  readonly calls: Array<[string, ...unknown[]]> = [];

  constructor(private readonly result: QueryResult) {}

  select(columns?: string) { return this.record('select', columns); }
  insert(values: unknown) { return this.record('insert', values); }
  update(values: unknown) { return this.record('update', values); }
  delete() { return this.record('delete'); }
  eq(column: string, value: unknown) { return this.record('eq', column, value); }
  in(column: string, values: readonly unknown[]) { return this.record('in', column, values); }
  gte(column: string, value: unknown) { return this.record('gte', column, value); }
  gt(column: string, value: unknown) { return this.record('gt', column, value); }
  lt(column: string, value: unknown) { return this.record('lt', column, value); }
  order(column: string, options?: { ascending?: boolean }) { return this.record('order', column, options); }
  maybeSingle() { return this.record('maybeSingle'); }
  single() { return this.record('single'); }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }

  private record(method: string, ...args: unknown[]): this {
    this.calls.push([method, ...args]);
    return this;
  }
}

function ok(data: unknown) {
  return new QueryDouble({ data, error: null });
}

function createClient(tableResults: Record<string, QueryDouble[]>, rpcData: unknown = null) {
  const fromCalls: Array<{ table: string; query: QueryDouble }> = [];
  const from = vi.fn((table: string) => {
    const query = tableResults[table]?.shift();
    if (!query) throw new Error(`Missing query double for ${table}`);
    fromCalls.push({ table, query });
    return query;
  });
  const rpc = vi.fn(async () => ({ data: rpcData, error: null }));
  return {
    client: { from, rpc } as unknown as InternalSupabaseClientLike,
    from,
    fromCalls,
    rpc,
  };
}

const context = { clinicId: 'clinic-a' };
const appointment = {
  id: 'appointment-1',
  clinic_id: 'clinic-a',
  location_id: 'location-1',
  professional_id: 'professional-1',
  patient_id: 'patient-1',
  lead_id: null,
  treatment_id: 'service-1',
  health_insurance_id: null,
  billing_type: 'private',
  appointment_type: 'consultation',
  start_time: '2026-08-17T12:00:00.000Z',
  end_time: '2026-08-17T13:00:00.000Z',
  duration_minutes: 60,
  status: 'scheduled',
  confirmed_at: null,
  notes: null,
  cancelled_reason: null,
  no_show_reason: null,
  rescheduled_from: null,
  rescheduled_to: null,
};

describe('SupabaseInternalSchedulingDataSource', () => {
  it('loads locations with explicit tenant and active filters', async () => {
    const query = ok([{ id: 'location-1', name: 'Principal', timezone: 'America/Sao_Paulo', active: true, is_primary: true }]);
    const { client } = createClient({ clinic_locations: [query] });
    const dataSource = new SupabaseInternalSchedulingDataSource(client);

    await expect(dataSource.listLocations(context, { activeOnly: true })).resolves.toHaveLength(1);
    expect(query.calls).toEqual(expect.arrayContaining([
      ['eq', 'clinic_id', 'clinic-a'],
      ['eq', 'active', true],
      ['order', 'is_primary', { ascending: false }],
      ['order', 'name', undefined],
    ]));
  });

  it('resolves professionals assigned to a location without crossing clinic scope', async () => {
    const links = ok([{ professional_id: 'professional-1' }]);
    const professionals = ok([{ id: 'professional-1', full_name: 'Dra. Aura', specialty: 'Dermatologia', status: 'active' }]);
    const { client } = createClient({ professional_locations: [links], professionals: [professionals] });
    const dataSource = new SupabaseInternalSchedulingDataSource(client);

    await expect(dataSource.listProfessionals(context, { locationId: 'location-1', activeOnly: true })).resolves.toHaveLength(1);
    expect(links.calls).toEqual(expect.arrayContaining([
      ['eq', 'clinic_id', 'clinic-a'], ['eq', 'location_id', 'location-1'], ['eq', 'active', true],
    ]));
    expect(professionals.calls).toEqual(expect.arrayContaining([
      ['eq', 'clinic_id', 'clinic-a'], ['eq', 'status', 'active'], ['in', 'id', ['professional-1']],
    ]));
  });

  it('maps professional service and insurance overrides from the existing link tables', async () => {
    const services = ok([{
      status: 'active', duration_minutes: 45, private_price: 350, show_price: false,
      can_ai_schedule: true, requires_previous_evaluation: false,
      treatments: { id: 'service-1', name: 'Consulta', duration_minutes: 30, is_active: true, can_be_scheduled_by_ai: false, show_price_to_ai: true, price: 300, requires_evaluation: true },
    }]);
    const insurances = ok([{
      status: 'active', accepts_new_patients: true, authorization_required: true,
      appointment_duration_minutes: 20, ai_instructions: 'Solicitar carteirinha', notes: null,
      health_insurances: { id: 'insurance-1', name: 'Convênio', status: 'active', authorization_notes: 'Guia prévia' },
    }]);
    const { client } = createClient({ professional_treatments: [services], professional_health_insurances: [insurances] });
    const dataSource = new SupabaseInternalSchedulingDataSource(client);

    await expect(dataSource.listServices(context, { professionalId: 'professional-1', activeOnly: true })).resolves.toEqual([
      expect.objectContaining({ duration_minutes: 45, private_price: 350, show_price: false, can_ai_schedule: true }),
    ]);
    await expect(dataSource.listInsurances(context, { professionalId: 'professional-1', activeOnly: true })).resolves.toEqual([
      expect.objectContaining({ appointment_duration_minutes: 20, authorization_required: true, notes: 'Guia prévia' }),
    ]);
    expect(services.calls).toContainEqual(['eq', 'clinic_id', 'clinic-a']);
    expect(insurances.calls).toContainEqual(['eq', 'clinic_id', 'clinic-a']);
  });

  it('loads clinic-wide services, insurances, and professional rules from their canonical tables', async () => {
    const treatments = ok([{
      id: 'service-1', name: 'Consulta', duration_minutes: 60, is_active: true,
      can_be_scheduled_by_ai: true, show_price_to_ai: true, price: 300, requires_evaluation: false,
    }]);
    const healthInsurances = ok([{ id: 'insurance-1', name: 'Convênio', status: 'active', authorization_notes: 'Guia prévia' }]);
    const rules = ok({
      professional_id: 'professional-1', accept_new_patients: true, allow_ai_booking: false,
      allow_ai_cancellation: false, allow_ai_rescheduling: false, allow_waitlist: true,
      minimum_booking_notice_hours: 2, maximum_booking_days: 90, cancellation_notice_hours: 24,
      default_appointment_duration_minutes: 30, private_appointment_duration_minutes: 60,
    });
    const { client } = createClient({
      treatments: [treatments], health_insurances: [healthInsurances], professional_settings: [rules],
    });
    const dataSource = new SupabaseInternalSchedulingDataSource(client);

    await expect(dataSource.listServices(context, { activeOnly: true })).resolves.toEqual([
      expect.objectContaining({ id: 'service-1', private_price: 300, can_ai_schedule: true }),
    ]);
    await expect(dataSource.listInsurances(context, { activeOnly: true })).resolves.toEqual([
      expect.objectContaining({ id: 'insurance-1', notes: 'Guia prévia' }),
    ]);
    await expect(dataSource.getProfessionalRules(context, { professionalId: 'professional-1' })).resolves.toEqual(
      expect.objectContaining({ professional_id: 'professional-1', private_appointment_duration_minutes: 60 }),
    );
    expect(treatments.calls).toEqual(expect.arrayContaining([['eq', 'clinic_id', 'clinic-a'], ['eq', 'is_active', true]]));
    expect(healthInsurances.calls).toEqual(expect.arrayContaining([['eq', 'clinic_id', 'clinic-a'], ['eq', 'status', 'active']]));
    expect(rules.calls).toEqual(expect.arrayContaining([['eq', 'clinic_id', 'clinic-a'], ['eq', 'professional_id', 'professional-1']]));
  });

  it('uses the canonical availability RPC with its exact current parameters', async () => {
    const { client, rpc } = createClient({}, [{ start_time: appointment.start_time, end_time: appointment.end_time, duration_minutes: 60 }]);
    const dataSource = new SupabaseInternalSchedulingDataSource(client);

    await dataSource.getAvailableSlots(context, {
      locationId: 'location-1', professionalId: 'professional-1', serviceId: 'service-1',
      dateRange: { from: '2026-08-17', to: '2026-08-18' }, stepMinutes: 10,
    });
    expect(rpc).toHaveBeenCalledWith('get_available_slots', {
      p_clinic_id: 'clinic-a', p_location_id: 'location-1', p_professional_id: 'professional-1',
      p_treatment_id: 'service-1', p_date_from: '2026-08-17', p_date_to: '2026-08-18', p_step_minutes: 10,
      p_billing_type: 'private', p_health_insurance_id: null,
    });
  });

  it('forwards insurance modality and insurance id to canonical availability', async () => {
    const { client, rpc } = createClient({}, []);
    const dataSource = new SupabaseInternalSchedulingDataSource(client);

    await dataSource.getAvailableSlots(context, {
      locationId: 'location-1', professionalId: 'professional-1', serviceId: 'service-1',
      billingType: 'insurance', insuranceId: 'insurance-1',
      dateRange: { from: '2026-08-17', to: '2026-08-18' },
    });
    expect(rpc).toHaveBeenCalledWith('get_available_slots', expect.objectContaining({
      p_clinic_id: 'clinic-a', p_billing_type: 'insurance', p_health_insurance_id: 'insurance-1',
    }));
  });

  it('lists appointments by tenant and half-open time range and expands scheduled status', async () => {
    const query = ok([appointment]);
    const { client } = createClient({ appointments: [query] });
    const dataSource = new SupabaseInternalSchedulingDataSource(client);

    await dataSource.listAppointments(context, {
      range: { startAt: '2026-08-17T00:00:00.000Z', endAt: '2026-08-18T00:00:00.000Z' },
      locationId: 'location-1', professionalId: 'professional-1', statuses: ['scheduled'],
    });
    expect(query.calls).toEqual(expect.arrayContaining([
      ['eq', 'clinic_id', 'clinic-a'],
      ['gte', 'start_time', '2026-08-17T00:00:00.000Z'],
      ['lt', 'start_time', '2026-08-18T00:00:00.000Z'],
      ['eq', 'location_id', 'location-1'],
      ['eq', 'professional_id', 'professional-1'],
      ['in', 'status', ['scheduled', 'confirmed']],
    ]));
  });

  it('creates an appointment through the secure RPC with billing metadata', async () => {
    const { client, rpc } = createClient({}, appointment);
    const dataSource = new SupabaseInternalSchedulingDataSource(client);

    await dataSource.createAppointment(context, {
      locationId: 'location-1', professionalId: 'professional-1', patientId: 'patient-1',
      serviceId: 'service-1', insuranceId: 'insurance-1', billingType: 'insurance',
      appointmentType: 'consultation', startAt: appointment.start_time, durationMinutes: 20,
    });
    expect(rpc).toHaveBeenCalledWith('create_appointment_secure', expect.objectContaining({
      p_clinic_id: 'clinic-a', p_location_id: 'location-1', p_professional_id: 'professional-1',
      p_patient_id: 'patient-1', p_billing_type: 'insurance', p_health_insurance_id: 'insurance-1',
      p_duration_minutes: 20,
    }));
  });

  it('uses the existing lifecycle RPCs with their exact operation-specific arguments', async () => {
    const { client, rpc } = createClient({}, appointment);
    const dataSource = new SupabaseInternalSchedulingDataSource(client);

    await dataSource.cancelAppointment(context, { appointmentId: 'appointment-1', reason: 'Paciente solicitou' });
    await dataSource.markNoShow(context, { appointmentId: 'appointment-1', reason: 'Ausente' });
    await dataSource.rescheduleAppointment(context, { appointmentId: 'appointment-1', startAt: '2026-08-18T12:00:00.000Z', durationMinutes: 60 });
    await dataSource.reassignProfessional(context, { appointmentId: 'appointment-1', professionalId: 'professional-2' });

    expect(rpc).toHaveBeenNthCalledWith(1, 'cancel_appointment_secure', { p_clinic_id: 'clinic-a', p_appointment_id: 'appointment-1', p_reason: 'Paciente solicitou', p_status: 'cancelled' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'cancel_appointment_secure', { p_clinic_id: 'clinic-a', p_appointment_id: 'appointment-1', p_reason: 'Ausente', p_status: 'no_show' });
    expect(rpc).toHaveBeenNthCalledWith(3, 'reschedule_appointment_secure', expect.objectContaining({ p_clinic_id: 'clinic-a', p_appointment_id: 'appointment-1', p_start_time: '2026-08-18T12:00:00.000Z', p_duration_minutes: 60 }));
    expect(rpc).toHaveBeenNthCalledWith(4, 'reassign_appointment_professional_secure', { p_clinic_id: 'clinic-a', p_appointment_id: 'appointment-1', p_professional_id: 'professional-2' });
  });

  it('scopes appointment reads and uses canonical confirmation/status RPCs with clinic id', async () => {
    const read = ok(appointment);
    const { client, rpc } = createClient({ appointments: [read] }, appointment);
    const dataSource = new SupabaseInternalSchedulingDataSource(client);

    await dataSource.getAppointment(context, { appointmentId: 'appointment-1' });
    await dataSource.confirmAppointment(context, { appointmentId: 'appointment-1' });
    await dataSource.updateAppointmentStatus(context, { appointmentId: 'appointment-1', status: 'completed' });
    expect(read.calls).toEqual(expect.arrayContaining([
      ['eq', 'clinic_id', 'clinic-a'], ['eq', 'id', 'appointment-1'], ['maybeSingle'],
    ]));
    expect(rpc).toHaveBeenNthCalledWith(1, 'confirm_appointment_secure', {
      p_clinic_id: 'clinic-a', p_appointment_id: 'appointment-1',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'transition_appointment_status_secure', {
      p_clinic_id: 'clinic-a', p_appointment_id: 'appointment-1', p_status: 'completed',
    });
  });

  it('keeps block reads, creates, and removals inside the clinic boundary', async () => {
    const list = ok([]);
    const create = ok({ id: 'block-1', location_id: null, professional_id: null, start_at: appointment.start_time, end_at: appointment.end_time, reason: 'Reunião', notes: null });
    const remove = ok({ id: 'block-1' });
    const { client } = createClient({ appointment_blocks: [list, create, remove] });
    const dataSource = new SupabaseInternalSchedulingDataSource(client);
    const range = { startAt: appointment.start_time, endAt: appointment.end_time };

    await dataSource.listBlocks(context, { range });
    await dataSource.createBlock(context, { ...range, reason: 'Reunião' });
    await expect(dataSource.removeBlock(context, { blockId: 'block-1' })).resolves.toBe(true);
    expect(list.calls).toContainEqual(['eq', 'clinic_id', 'clinic-a']);
    expect(create.calls).toContainEqual(['insert', expect.objectContaining({ clinic_id: 'clinic-a' })]);
    expect(remove.calls).toEqual(expect.arrayContaining([['eq', 'clinic_id', 'clinic-a'], ['eq', 'id', 'block-1']]));
  });

  it('propagates Supabase errors for provider-level normalization', async () => {
    const query = new QueryDouble({ data: null, error: { code: '42501', message: 'row-level security violation' } });
    const { client } = createClient({ professional_settings: [query] });
    const dataSource = new SupabaseInternalSchedulingDataSource(client);
    await expect(dataSource.getProfessionalRules(context, { professionalId: 'professional-1' })).rejects.toEqual(expect.objectContaining({ code: '42501' }));
  });
});
