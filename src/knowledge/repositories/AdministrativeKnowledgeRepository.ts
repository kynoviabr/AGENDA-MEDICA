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

export interface AdministrativeKnowledgeRepository {
  getClinic(context: AdministrativeKnowledgeContext): Promise<AdministrativeClinicRecord | null>;
  listLocations(context: AdministrativeKnowledgeContext): Promise<readonly AdministrativeLocationRecord[]>;
  listProfessionals(context: AdministrativeKnowledgeContext): Promise<readonly AdministrativeProfessionalRecord[]>;
  listServices(context: AdministrativeKnowledgeContext): Promise<readonly AdministrativeServiceRecord[]>;
  listInsurances(context: AdministrativeKnowledgeContext): Promise<readonly AdministrativeInsuranceRecord[]>;
  getClinicPolicy(context: AdministrativeKnowledgeContext): Promise<AdministrativeClinicPolicyRecord | null>;
  listPublishedEntries(context: AdministrativeKnowledgeContext, limit: number): Promise<readonly CuratedKnowledgeEntryRecord[]>;
}
