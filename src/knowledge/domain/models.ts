export type AdministrativeKnowledgeTopic =
  | 'address'
  | 'parking'
  | 'accessibility'
  | 'opening_hours'
  | 'arrival'
  | 'required_documents'
  | 'companion'
  | 'children'
  | 'first_consultation'
  | 'service_preparation'
  | 'payment_methods'
  | 'late_policy'
  | 'cancellation_policy'
  | 'professional_information'
  | 'insurance_information'
  | 'contact'
  | 'faq'
  | 'unknown';

export type AdministrativeKnowledgeScope = 'clinic' | 'location' | 'professional' | 'service' | 'insurance';

export interface AdministrativeKnowledgeContext { clinicId: string }

export interface AdministrativeKnowledgeSource {
  sourceType: 'structured' | 'curated';
  table: string;
  recordId: string;
  field?: string;
  label: string;
  revision?: number;
  verifiedAt?: string;
}

export interface AdministrativeKnowledgeFact {
  text: string;
  source: AdministrativeKnowledgeSource;
}

export interface AdministrativeKnowledgeAnswer {
  topic: AdministrativeKnowledgeTopic;
  outcome: 'answered' | 'not_found' | 'ambiguous' | 'restricted';
  facts: readonly AdministrativeKnowledgeFact[];
  safeMessage: string;
}

export interface AdministrativeKnowledgeSearchInput {
  query: string;
  locationName?: string;
  professionalName?: string;
  serviceName?: string;
  insuranceName?: string;
}

export interface AdministrativeClinicRecord {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  supportWhatsapp?: string;
}

export interface AdministrativeLocationRecord {
  id: string;
  name: string;
  addressLine?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  timezone: string;
  isPrimary: boolean;
  openingHours?: Readonly<Record<string, readonly string[]>>;
  parkingInformation?: string;
  accessibilityInformation?: string;
}

export interface AdministrativeProfessionalRecord { id: string; fullName: string; specialty?: string }

export interface AdministrativeServiceRecord {
  id: string;
  name: string;
  description?: string;
  preparationInstructions?: string;
  administrativeInstructions?: string;
}

export interface AdministrativeInsuranceRecord { id: string; name: string; authorizationNotes?: string }

export interface AdministrativeClinicPolicyRecord {
  id: string;
  arrivalMinutes?: number;
  arrivalInstructions?: string;
  requiredDocuments: readonly string[];
  companionPolicy?: string;
  childrenPolicy?: string;
  firstConsultationInformation?: string;
  allowedPaymentMethods: readonly string[];
  latePolicy?: string;
  cancellationPolicy?: string;
  updatedAt: string;
}

export interface CuratedKnowledgeEntryRecord {
  id: string;
  topic: AdministrativeKnowledgeTopic;
  scope: AdministrativeKnowledgeScope;
  locationId?: string;
  professionalId?: string;
  serviceId?: string;
  insuranceId?: string;
  question: string;
  answer: string;
  keywords: readonly string[];
  priority: number;
  revision: number;
  verifiedAt: string;
  validFrom?: string;
  validUntil?: string;
}
