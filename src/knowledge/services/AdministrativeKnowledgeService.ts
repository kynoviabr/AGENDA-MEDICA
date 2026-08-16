import type {
  AdministrativeKnowledgeAnswer,
  AdministrativeKnowledgeContext,
  AdministrativeKnowledgeFact,
  AdministrativeKnowledgeSearchInput,
  AdministrativeKnowledgeSource,
  AdministrativeKnowledgeTopic,
  CuratedKnowledgeEntryRecord,
} from '../domain/models.ts';
import type { AdministrativeKnowledgeRepository } from '../repositories/AdministrativeKnowledgeRepository.ts';

const MAX_FACTS = 8;
const DAYS: Record<string, string> = {
  monday: 'segunda-feira', tuesday: 'terça-feira', wednesday: 'quarta-feira', thursday: 'quinta-feira',
  friday: 'sexta-feira', saturday: 'sábado', sunday: 'domingo',
};

export class AdministrativeKnowledgeService {
  constructor(private readonly repository: AdministrativeKnowledgeRepository, private readonly now: () => Date = () => new Date()) {}

  async search(context: AdministrativeKnowledgeContext, input: AdministrativeKnowledgeSearchInput): Promise<AdministrativeKnowledgeAnswer> {
    if (!context.clinicId?.trim() || !input.query?.trim() || input.query.length > 500) return notFound('unknown');
    if (isClinicalQuestion(input.query)) return {
      topic: 'unknown', outcome: 'restricted', facts: [],
      safeMessage: 'Não posso fornecer diagnóstico ou orientação clínica. Posso encaminhar sua dúvida para a equipe da clínica.',
    };
    const topic = classifyTopic(input.query);
    const [clinic, locations, professionals, services, insurances, policy, entries] = await Promise.all([
      this.repository.getClinic(context), this.repository.listLocations(context),
      this.repository.listProfessionals(context), this.repository.listServices(context),
      this.repository.listInsurances(context), this.repository.getClinicPolicy(context),
      this.repository.listPublishedEntries(context, 100),
    ]);
    const facts: AdministrativeKnowledgeFact[] = [];
    const locationMatches = matchEntities(locations, input.locationName, input.query, (item) => item.name);
    const professionalMatches = matchEntities(professionals, input.professionalName, input.query, (item) => item.fullName);
    const serviceMatches = matchEntities(services, input.serviceName, input.query, (item) => item.name);
    const insuranceMatches = matchEntities(insurances, input.insuranceName, input.query, (item) => item.name);

    if (topic === 'address') {
      for (const location of selectedLocations(locations, locationMatches)) {
        const address = [location.addressLine, location.city, location.state, location.zipCode].filter(Boolean).join(', ');
        if (address) facts.push(fact(`${location.name}: ${address}.`, source('clinic_locations', location.id, 'address', location.name)));
      }
    }
    if (topic === 'parking' || topic === 'accessibility' || topic === 'opening_hours') {
      for (const location of selectedLocations(locations, locationMatches)) {
        const value = topic === 'parking' ? location.parkingInformation
          : topic === 'accessibility' ? location.accessibilityInformation
            : formatOpeningHours(location.openingHours);
        if (value) facts.push(fact(`${location.name}: ${value}`, source('clinic_locations', location.id, topic, location.name)));
      }
    }
    if (topic === 'arrival' && policy) {
      if (policy.arrivalMinutes !== undefined) facts.push(fact(`Chegue com ${policy.arrivalMinutes} minutos de antecedência.`, source('clinic_administrative_policies', policy.id, 'arrival_minutes', 'Política de chegada', policy.updatedAt)));
      if (policy.arrivalInstructions) facts.push(fact(policy.arrivalInstructions, source('clinic_administrative_policies', policy.id, 'arrival_instructions', 'Orientação de chegada', policy.updatedAt)));
    }
    if (topic === 'required_documents' && policy?.requiredDocuments.length) {
      facts.push(fact(`Documentos solicitados: ${policy.requiredDocuments.join(', ')}.`, source('clinic_administrative_policies', policy.id, 'required_documents', 'Documentos necessários', policy.updatedAt)));
    }
    const policyText: Partial<Record<AdministrativeKnowledgeTopic, [string | undefined, string]>> = policy ? {
      companion: [policy.companionPolicy, 'companion_policy'], children: [policy.childrenPolicy, 'children_policy'],
      first_consultation: [policy.firstConsultationInformation, 'first_consultation_information'],
      late_policy: [policy.latePolicy, 'late_policy'], cancellation_policy: [policy.cancellationPolicy, 'cancellation_policy'],
    } : {};
    const selectedPolicy = policyText[topic];
    if (policy && selectedPolicy?.[0]) facts.push(fact(selectedPolicy[0], source('clinic_administrative_policies', policy.id, selectedPolicy[1], topicLabel(topic), policy.updatedAt)));
    if (topic === 'payment_methods' && policy?.allowedPaymentMethods.length) {
      facts.push(fact(`Formas de pagamento aceitas: ${policy.allowedPaymentMethods.join(', ')}.`, source('clinic_administrative_policies', policy.id, 'allowed_payment_methods', 'Formas de pagamento', policy.updatedAt)));
    }
    if (topic === 'service_preparation') {
      for (const service of serviceMatches) {
        if (service.preparationInstructions) facts.push(fact(`${service.name}: ${service.preparationInstructions}`, source('treatments', service.id, 'preparation_instructions', service.name)));
        if (service.administrativeInstructions) facts.push(fact(`${service.name}: ${service.administrativeInstructions}`, source('treatments', service.id, 'administrative_instructions', service.name)));
      }
    }
    if (topic === 'professional_information') {
      for (const professional of professionalMatches) {
        const detail = [professional.fullName, professional.specialty].filter(Boolean).join(' — ');
        if (detail) facts.push(fact(detail, source('professionals', professional.id, 'specialty', professional.fullName)));
      }
    }
    if (topic === 'insurance_information') {
      for (const insurance of insuranceMatches) {
        const text = insurance.authorizationNotes ? `${insurance.name}: ${insurance.authorizationNotes}` : undefined;
        if (text) facts.push(fact(text, source('health_insurances', insurance.id, 'authorization_notes', insurance.name)));
      }
    }
    if (topic === 'contact' && clinic) {
      const contacts = [clinic.phone && `telefone ${clinic.phone}`, clinic.supportWhatsapp && `WhatsApp ${clinic.supportWhatsapp}`, clinic.email && `e-mail ${clinic.email}`].filter(Boolean);
      if (contacts.length) facts.push(fact(`Contato da ${clinic.name}: ${contacts.join(', ')}.`, source('clinics', clinic.id, 'contacts', clinic.name)));
    }

    const curated = rankEntries(entries, input, topic, locationMatches.map((item) => item.id), professionalMatches.map((item) => item.id), serviceMatches.map((item) => item.id), insuranceMatches.map((item) => item.id), this.now());
    for (const entry of curated) facts.push(fact(entry.answer, {
      sourceType: 'curated', table: 'administrative_knowledge_entries', recordId: entry.id,
      label: entry.question, revision: entry.revision, verifiedAt: entry.verifiedAt,
    }));

    const unique = deduplicateFacts(facts).slice(0, MAX_FACTS);
    return unique.length ? { topic, outcome: 'answered', facts: unique, safeMessage: 'Informação administrativa confirmada.' } : notFound(topic);
  }
}

export function classifyTopic(value: string): AdministrativeKnowledgeTopic {
  const text = normalize(value);
  if (/\b(endereco|onde fica|localizacao|como chegar)\b/.test(text)) return 'address';
  if (/\b(estacionamento|estacionar|vaga)\b/.test(text)) return 'parking';
  if (/\b(acessibilidade|cadeirante|rampa|elevador)\b/.test(text)) return 'accessibility';
  if (/\b(horario de funcionamento|que horas abre|que horas fecha|funciona)\b/.test(text)) return 'opening_hours';
  if (/\b(chegar antes|antecedencia|quanto tempo antes)\b/.test(text)) return 'arrival';
  if (/\b(documento|documentos|identidade|carteirinha)\b/.test(text)) return 'required_documents';
  if (/\b(acompanhante|acompanhar|acompanhado)\b/.test(text)) return 'companion';
  if (/\b(crianca|criancas|infantil|menor de idade)\b/.test(text)) return 'children';
  if (/\b(primeira consulta|primeiro atendimento|como funciona a consulta)\b/.test(text)) return 'first_consultation';
  if (/\b(preparo|preparacao|antes do exame|antes do procedimento|orientacao antes)\b/.test(text)) return 'service_preparation';
  if (/\b(forma de pagamento|formas de pagamento|pagar|pix|cartao|dinheiro)\b/.test(text)) return 'payment_methods';
  if (/\b(atraso|atrasar|tolerancia)\b/.test(text)) return 'late_policy';
  if (/\b(politica de cancelamento|prazo para cancelar|cancelar antes)\b/.test(text)) return 'cancellation_policy';
  if (/\b(profissional|medico|medica|doutor|doutora|especialidade)\b/.test(text)) return 'professional_information';
  if (/\b(convenio|plano de saude|autorizacao)\b/.test(text)) return 'insurance_information';
  if (/\b(telefone|contato|whatsapp|e-mail|email)\b/.test(text)) return 'contact';
  return 'faq';
}

function isClinicalQuestion(value: string) {
  const text = normalize(value);
  return /\b(diagnostico|diagnosticar|o que eu tenho|qual tratamento devo|qual remedio|qual dose|interpretar exame|resultado do exame)\b/.test(text);
}

function selectedLocations<T extends { isPrimary: boolean }>(all: readonly T[], matches: readonly T[]) {
  if (matches.length) return matches;
  const primary = all.filter((item) => item.isPrimary);
  return primary.length ? primary : all;
}

function matchEntities<T>(items: readonly T[], hint: string | undefined, query: string, label: (item: T) => string): T[] {
  const target = normalize(hint || query);
  if (!hint) {
    const explicit = items.filter((item) => target.includes(normalize(label(item))));
    return explicit;
  }
  return items.filter((item) => normalize(label(item)).includes(target) || target.includes(normalize(label(item))));
}

function rankEntries(
  entries: readonly CuratedKnowledgeEntryRecord[], input: AdministrativeKnowledgeSearchInput,
  topic: AdministrativeKnowledgeTopic, locationIds: readonly string[], professionalIds: readonly string[],
  serviceIds: readonly string[], insuranceIds: readonly string[], now: Date,
) {
  const tokens = new Set(normalize(input.query).split(/\W+/).filter((item) => item.length >= 3));
  return entries.filter((entry) => isEntryActive(entry, now) && scopeMatches(entry, locationIds, professionalIds, serviceIds, insuranceIds))
    .map((entry) => {
      const haystack = normalize(`${entry.question} ${entry.keywords.join(' ')}`);
      const lexical = [...tokens].filter((token) => haystack.includes(token)).length;
      const topicBoost = entry.topic === topic ? 3 : entry.topic === 'faq' ? 0 : -2;
      return { entry, score: lexical + topicBoost + entry.priority / 100 };
    })
    .filter((item) => item.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3).map((item) => item.entry);
}

function scopeMatches(entry: CuratedKnowledgeEntryRecord, locationIds: readonly string[], professionalIds: readonly string[], serviceIds: readonly string[], insuranceIds: readonly string[]) {
  if (entry.scope === 'clinic') return true;
  if (entry.scope === 'location') return Boolean(entry.locationId && locationIds.includes(entry.locationId));
  if (entry.scope === 'professional') return Boolean(entry.professionalId && professionalIds.includes(entry.professionalId));
  if (entry.scope === 'service') return Boolean(entry.serviceId && serviceIds.includes(entry.serviceId));
  return Boolean(entry.insuranceId && insuranceIds.includes(entry.insuranceId));
}

function isEntryActive(entry: CuratedKnowledgeEntryRecord, now: Date) {
  const timestamp = now.getTime();
  return (!entry.validFrom || new Date(entry.validFrom).getTime() <= timestamp)
    && (!entry.validUntil || new Date(entry.validUntil).getTime() >= timestamp);
}

function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim(); }
function fact(text: string, sourceValue: AdministrativeKnowledgeSource): AdministrativeKnowledgeFact { return { text: text.trim(), source: sourceValue }; }
function source(table: string, recordId: string, field: string, label: string, verifiedAt?: string): AdministrativeKnowledgeSource {
  return { sourceType: 'structured', table, recordId, field, label, verifiedAt };
}
function deduplicateFacts(items: readonly AdministrativeKnowledgeFact[]) {
  const seen = new Set<string>();
  return items.filter((item) => { const key = normalize(item.text); if (seen.has(key)) return false; seen.add(key); return true; });
}
function formatOpeningHours(hours?: Readonly<Record<string, readonly string[]>>) {
  if (!hours) return undefined;
  const rows = Object.entries(hours).filter(([, ranges]) => ranges.length).map(([day, ranges]) => `${DAYS[day] || day}: ${ranges.join(' e ')}`);
  return rows.length ? rows.join('; ') + '.' : undefined;
}
function topicLabel(topic: AdministrativeKnowledgeTopic) { return topic.replaceAll('_', ' '); }
function notFound(topic: AdministrativeKnowledgeTopic): AdministrativeKnowledgeAnswer {
  return { topic, outcome: 'not_found', facts: [], safeMessage: 'Não tenho essa informação confirmada aqui. Posso encaminhar sua dúvida para a equipe da clínica.' };
}
