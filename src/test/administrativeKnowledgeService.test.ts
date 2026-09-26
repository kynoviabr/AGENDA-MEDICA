import { describe, expect, it } from 'vitest';
import { AdministrativeKnowledgeService } from '@/knowledge/services/AdministrativeKnowledgeService';
import type { AdministrativeKnowledgeRepository } from '@/knowledge/repositories/AdministrativeKnowledgeRepository';

function repository(overrides: Partial<AdministrativeKnowledgeRepository> = {}): AdministrativeKnowledgeRepository {
  return {
    getClinic: async () => ({ id: 'clinic-a', name: 'Clínica A', phone: '1133334444' }),
    listLocations: async () => [{
      id: 'location-a', name: 'Unidade Centro', addressLine: 'Rua A, 10', city: 'São Paulo', state: 'SP', zipCode: '01000-000',
      timezone: 'America/Sao_Paulo', isPrimary: true, parkingInformation: 'Estacionamento conveniado ao lado.',
      openingHours: { schemaVersion: 1, weekdays: { '1': [{ start: '08:00', end: '18:00' }] } },
    }],
    listProfessionals: async () => [{ id: 'professional-a', fullName: 'Dra. Ana', specialty: 'Dermatologia' }],
    listServices: async () => [{ id: 'service-a', name: 'Endoscopia', preparationInstructions: 'Jejum conforme orientação entregue pela clínica.' }],
    listInsurances: async () => [{ id: 'insurance-a', name: 'Unimed', authorizationNotes: 'Apresente a guia autorizada.' }],
    getClinicPolicy: async () => ({
      id: 'policy-a', arrivalMinutes: 15, requiredDocuments: ['Documento com foto', 'Carteirinha'],
      allowedPaymentMethods: ['Pix', 'Cartão'], companionPolicy: 'Pode levar um acompanhante.',
      childrenPolicy: 'Atendemos crianças a partir de 12 anos.', latePolicy: 'Tolerância de 10 minutos.',
      cancellationPolicy: 'Cancele com 24 horas de antecedência.', updatedAt: '2026-08-15T00:00:00Z',
    }),
    listPublishedEntries: async () => [],
    ...overrides,
  };
}

describe('5.6D AdministrativeKnowledgeService', () => {
  it('answers address and parking from structured tenant data with explicit sources', async () => {
    const service = new AdministrativeKnowledgeService(repository());
    const address = await service.search({ clinicId: 'clinic-a' }, { query: 'Qual o endereço?' });
    expect(address).toMatchObject({ outcome: 'answered', facts: [{ source: { table: 'clinic_locations', recordId: 'location-a' } }] });
    const parking = await service.search({ clinicId: 'clinic-a' }, { query: 'Tem estacionamento?' });
    expect(parking.facts[0].text).toContain('conveniado');
  });

  it('does not invent absent facts and returns the mandatory safe fallback', async () => {
    const service = new AdministrativeKnowledgeService(repository({ listLocations: async () => [{ id: 'location-a', name: 'Centro', timezone: 'America/Sao_Paulo', isPrimary: true }] }));
    const result = await service.search({ clinicId: 'clinic-a' }, { query: 'Tem estacionamento?' });
    expect(result).toEqual({ topic: 'parking', outcome: 'not_found', facts: [], safeMessage: 'Não tenho essa informação confirmada aqui. Posso encaminhar sua dúvida para a equipe da clínica.' });
  });

  it('uses only stored preparation instructions and policy fields', async () => {
    const service = new AdministrativeKnowledgeService(repository());
    const prep = await service.search({ clinicId: 'clinic-a' }, { query: 'Qual o preparo da Endoscopia?' });
    expect(prep.facts[0]).toMatchObject({ text: expect.stringContaining('Jejum'), source: { table: 'treatments' } });
    const documents = await service.search({ clinicId: 'clinic-a' }, { query: 'Precisa levar documento?' });
    expect(documents.facts[0].text).toContain('Carteirinha');
  });

  it('blocks diagnosis and clinical advice', async () => {
    const result = await new AdministrativeKnowledgeService(repository()).search({ clinicId: 'clinic-a' }, { query: 'Qual remédio e dose devo tomar?' });
    expect(result).toMatchObject({ outcome: 'restricted', facts: [] });
  });

  it('uses only currently valid, published repository entries and preserves revision evidence', async () => {
    const service = new AdministrativeKnowledgeService(repository({ listPublishedEntries: async () => [{
      id: 'faq-a', topic: 'faq', scope: 'clinic', question: 'Posso levar acompanhante?', answer: 'Sim, um acompanhante.',
      keywords: ['acompanhante'], priority: 80, revision: 3, verifiedAt: '2026-08-14T00:00:00Z', validUntil: '2026-08-20T00:00:00Z',
    }] }), () => new Date('2026-08-15T00:00:00Z'));
    const result = await service.search({ clinicId: 'clinic-a' }, { query: 'Posso levar acompanhante?' });
    expect(result.facts).toContainEqual(expect.objectContaining({ source: expect.objectContaining({ table: 'administrative_knowledge_entries', revision: 3 }) }));
  });

  it('keeps structured opening hours authoritative over conflicting curated content', async () => {
    const service = new AdministrativeKnowledgeService(repository({ listPublishedEntries: async () => [{
      id: 'faq-hours', topic: 'opening_hours', scope: 'clinic', question: 'Abre domingo?', answer: 'Aberto aos domingos.',
      keywords: ['domingo', 'aberto'], priority: 100, revision: 1, verifiedAt: '2026-08-14T00:00:00Z',
    }] }));
    const result = await service.search({ clinicId: 'clinic-a' }, { query: 'Qual o horário de funcionamento?' });
    expect(result.facts[0].text).toContain('segunda-feira: 08:00–18:00');
    expect(result.facts).not.toContainEqual(expect.objectContaining({ text: 'Aberto aos domingos.' }));
  });
});
