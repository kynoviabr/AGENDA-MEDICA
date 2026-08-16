import type {
  AdministrativeClinicPolicyRecord,
  AdministrativeClinicRecord,
  AdministrativeInsuranceRecord,
  AdministrativeKnowledgeContext,
  AdministrativeLocationRecord,
  AdministrativeProfessionalRecord,
  AdministrativeServiceRecord,
  CuratedKnowledgeEntryRecord,
} from '../domain/models.ts';
import type { AdministrativeKnowledgeRepository } from './AdministrativeKnowledgeRepository.ts';

interface KnowledgeResult { data: unknown; error: unknown }
interface KnowledgeQuery extends PromiseLike<KnowledgeResult> {
  select(columns?: string): KnowledgeQuery;
  eq(column: string, value: unknown): KnowledgeQuery;
  order(column: string, options?: { ascending?: boolean }): KnowledgeQuery;
  limit(value: number): KnowledgeQuery;
  maybeSingle(): KnowledgeQuery;
}
export interface KnowledgeSupabaseClientLike { from(table: string): KnowledgeQuery }

async function unwrap<T>(query: PromiseLike<KnowledgeResult>): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data as T;
}

export class SupabaseAdministrativeKnowledgeRepository implements AdministrativeKnowledgeRepository {
  constructor(private readonly client: KnowledgeSupabaseClientLike) {}

  async getClinic(context: AdministrativeKnowledgeContext): Promise<AdministrativeClinicRecord | null> {
    const row = await unwrap<{ id: string; name: string; phone: string | null; email: string | null; support_whatsapp: string | null } | null>(
      this.client.from('clinics').select('id,name,phone,email,support_whatsapp').eq('id', context.clinicId).maybeSingle(),
    );
    return row ? { id: row.id, name: row.name, phone: row.phone || undefined, email: row.email || undefined, supportWhatsapp: row.support_whatsapp || undefined } : null;
  }

  async listLocations(context: AdministrativeKnowledgeContext): Promise<readonly AdministrativeLocationRecord[]> {
    const rows = await unwrap<Array<{
      id: string; name: string; address_line: string | null; city: string | null; state: string | null; zip_code: string | null;
      phone: string | null; timezone: string; is_primary: boolean; opening_hours: Record<string, string[]> | null;
      parking_information: string | null; accessibility_information: string | null;
    }>>(this.client.from('clinic_locations')
      .select('id,name,address_line,city,state,zip_code,phone,timezone,is_primary,opening_hours,parking_information,accessibility_information')
      .eq('clinic_id', context.clinicId).eq('active', true).order('is_primary', { ascending: false }).order('name'));
    return rows.map((row) => ({
      id: row.id, name: row.name, addressLine: row.address_line || undefined, city: row.city || undefined,
      state: row.state || undefined, zipCode: row.zip_code || undefined, phone: row.phone || undefined,
      timezone: row.timezone, isPrimary: row.is_primary, openingHours: row.opening_hours || undefined,
      parkingInformation: row.parking_information || undefined, accessibilityInformation: row.accessibility_information || undefined,
    }));
  }

  async listProfessionals(context: AdministrativeKnowledgeContext): Promise<readonly AdministrativeProfessionalRecord[]> {
    const rows = await unwrap<Array<{ id: string; full_name: string; specialty: string | null }>>(
      this.client.from('professionals').select('id,full_name,specialty').eq('clinic_id', context.clinicId).eq('status', 'active').order('full_name'),
    );
    return rows.map((row) => ({ id: row.id, fullName: row.full_name, specialty: row.specialty || undefined }));
  }

  async listServices(context: AdministrativeKnowledgeContext): Promise<readonly AdministrativeServiceRecord[]> {
    const rows = await unwrap<Array<{
      id: string; name: string; description: string | null; preparation_instructions: string | null; administrative_instructions: string | null;
    }>>(this.client.from('treatments').select('id,name,description,preparation_instructions,administrative_instructions')
      .eq('clinic_id', context.clinicId).eq('is_active', true).order('name'));
    return rows.map((row) => ({
      id: row.id, name: row.name, description: row.description || undefined,
      preparationInstructions: row.preparation_instructions || undefined,
      administrativeInstructions: row.administrative_instructions || undefined,
    }));
  }

  async listInsurances(context: AdministrativeKnowledgeContext): Promise<readonly AdministrativeInsuranceRecord[]> {
    const rows = await unwrap<Array<{ id: string; name: string; authorization_notes: string | null }>>(
      this.client.from('health_insurances').select('id,name,authorization_notes').eq('clinic_id', context.clinicId).eq('status', 'active').order('name'),
    );
    return rows.map((row) => ({ id: row.id, name: row.name, authorizationNotes: row.authorization_notes || undefined }));
  }

  async getClinicPolicy(context: AdministrativeKnowledgeContext): Promise<AdministrativeClinicPolicyRecord | null> {
    const row = await unwrap<{
      id: string; arrival_minutes: number | null; arrival_instructions: string | null; required_documents: string[];
      companion_policy: string | null; children_policy: string | null; first_consultation_information: string | null;
      allowed_payment_methods: string[]; late_policy: string | null; cancellation_policy: string | null; updated_at: string;
    } | null>(this.client.from('clinic_administrative_policies')
      .select('id,arrival_minutes,arrival_instructions,required_documents,companion_policy,children_policy,first_consultation_information,allowed_payment_methods,late_policy,cancellation_policy,updated_at')
      .eq('clinic_id', context.clinicId).maybeSingle());
    return row ? {
      id: row.id, arrivalMinutes: row.arrival_minutes ?? undefined, arrivalInstructions: row.arrival_instructions || undefined,
      requiredDocuments: row.required_documents || [], companionPolicy: row.companion_policy || undefined,
      childrenPolicy: row.children_policy || undefined, firstConsultationInformation: row.first_consultation_information || undefined,
      allowedPaymentMethods: row.allowed_payment_methods || [], latePolicy: row.late_policy || undefined,
      cancellationPolicy: row.cancellation_policy || undefined, updatedAt: row.updated_at,
    } : null;
  }

  async listPublishedEntries(context: AdministrativeKnowledgeContext, limit: number): Promise<readonly CuratedKnowledgeEntryRecord[]> {
    const rows = await unwrap<Array<{
      id: string; topic: CuratedKnowledgeEntryRecord['topic']; scope: CuratedKnowledgeEntryRecord['scope'];
      location_id: string | null; professional_id: string | null; service_id: string | null; insurance_id: string | null;
      question: string; answer: string; keywords: string[]; priority: number; revision: number; verified_at: string;
      valid_from: string | null; valid_until: string | null;
    }>>(this.client.from('administrative_knowledge_entries')
      .select('id,topic,scope,location_id,professional_id,service_id,insurance_id,question,answer,keywords,priority,revision,verified_at,valid_from,valid_until')
      .eq('clinic_id', context.clinicId).eq('status', 'published').order('priority', { ascending: false }).limit(Math.min(100, Math.max(1, limit))));
    return rows.map((row) => ({
      id: row.id, topic: row.topic, scope: row.scope, locationId: row.location_id || undefined,
      professionalId: row.professional_id || undefined, serviceId: row.service_id || undefined,
      insuranceId: row.insurance_id || undefined, question: row.question, answer: row.answer,
      keywords: row.keywords || [], priority: row.priority, revision: row.revision, verifiedAt: row.verified_at,
      validFrom: row.valid_from || undefined, validUntil: row.valid_until || undefined,
    }));
  }
}
