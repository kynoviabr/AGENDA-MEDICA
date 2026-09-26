import { describe, expect, it, vi } from 'vitest';
import { AdministrativeKnowledgeService } from '@/knowledge/services/AdministrativeKnowledgeService';
import type { AdministrativeKnowledgeRepository } from '@/knowledge/repositories/AdministrativeKnowledgeRepository';
import { AdministrativeKnowledgeToolExecutor, AiToolRegistry, ConversationStateToolPlanner, createEmptyConversationState } from '@/ai';

const context = { clinicId: 'clinic-a', conversationId: 'conversation-a', correlationId: 'correlation-a', channel: 'whatsapp' as const };
const config = { readEnabled: true, mutationsEnabled: false, knowledgeEnabled: true, knowledgeValidatedAt: '2026-08-15T00:00:00Z' };
const repo: AdministrativeKnowledgeRepository = {
  getClinic: async () => ({ id: 'clinic-a', name: 'Clínica A' }),
  listLocations: async () => [{ id: 'location-a', name: 'Centro', timezone: 'America/Sao_Paulo', isPrimary: true, parkingInformation: 'Estacionamento ao lado.' }],
  listProfessionals: async () => [], listServices: async () => [], listInsurances: async () => [], getClinicPolicy: async () => null,
  listPublishedEntries: async () => [],
};
const tool = (args: Record<string, unknown>) => ({ schemaVersion: 1 as const, name: 'search_administrative_knowledge' as const, kind: 'read' as const, intent: 'administrative_question' as const, arguments: args });

describe('5.6D controlled knowledge tool', () => {
  it('routes administrative questions to knowledge without replacing catalog listing tools', () => {
    const planner = new ConversationStateToolPlanner();
    expect(planner.plan({ context, intent: 'location_question', state: createEmptyConversationState(), messageText: 'Tem estacionamento?' })?.name).toBe('search_administrative_knowledge');
    expect(planner.plan({ context, intent: 'location_question', state: createEmptyConversationState(), messageText: 'Quais unidades vocês têm?' })?.name).toBe('list_locations');
  });

  it('requires the independent validated rollout gate', async () => {
    const executor = new AdministrativeKnowledgeToolExecutor(new AdministrativeKnowledgeService(repo));
    const result = await executor.execute({ context, conversationState: createEmptyConversationState(), config: { ...config, knowledgeEnabled: false }, tool: tool({ query: 'Tem estacionamento?' }) });
    expect(result).toMatchObject({ outcome: 'denied', errorCode: 'AI_TOOL_KNOWLEDGE_DISABLED' });
  });

  it('rejects tenant identifiers supplied as LLM arguments', async () => {
    const executor = new AdministrativeKnowledgeToolExecutor(new AdministrativeKnowledgeService(repo), new AiToolRegistry());
    const result = await executor.execute({ context, conversationState: createEmptyConversationState(), config, tool: tool({ query: 'Tem estacionamento?', clinicId: 'clinic-b' }) });
    expect(result).toMatchObject({ outcome: 'denied', errorCode: 'AI_TOOL_INVALID_REQUEST' });
  });

  it('executes in trusted tenant context and audits only source metadata', async () => {
    const audit = { record: vi.fn(async () => undefined) };
    const executor = new AdministrativeKnowledgeToolExecutor(new AdministrativeKnowledgeService(repo), undefined, undefined, audit);
    const result = await executor.execute({ context, conversationState: createEmptyConversationState(), config, tool: tool({ query: 'Tem estacionamento?' }) });
    expect(result).toMatchObject({ outcome: 'success', data: { knowledgeOutcome: 'answered' } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ context, outcome: 'answered', sources: [expect.objectContaining({ recordId: 'location-a' })] }));
  });
});
