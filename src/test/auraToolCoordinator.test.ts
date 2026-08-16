import { describe, expect, it, vi } from 'vitest';
import {
  AuraToolCoordinator,
  ConversationStateToolPlanner,
  InMemoryAiConversationStateRepository,
  createEmptyConversationState,
  type AiToolExecutor,
  type AiToolResponseComposer,
  type AiConversationResult,
} from '@/ai';

const context = { clinicId: 'clinic-a', conversationId: 'conversation-a', channel: 'whatsapp' as const, correlationId: 'correlation-a', patientId: 'patient-a' };
const config = {
  clinicId: 'clinic-a', clinicName: 'Clínica A', enabled: true, preferredLanguage: 'pt-BR', responseStyle: 'curta',
  toolExecution: { engineMode: 'active' as const, readEnabled: true, readValidatedAt: '2026-08-15T20:00:00.000Z', mutationsEnabled: true },
};

function conversation(): AiConversationResult {
  const state = createEmptyConversationState();
  state.activeIntent = 'scheduling_request';
  state.entities = {
    professional: { value: 'Dra. Ana', source: 'user_text', confidence: 'high', requiresConfirmation: false },
    billingType: { value: 'private', source: 'user_text', confidence: 'high', requiresConfirmation: false },
    date: { value: { raw: 'terça', kind: 'exact_date', resolvedDate: '2026-08-18', timezone: 'America/Sao_Paulo' }, source: 'user_text', confidence: 'high', requiresConfirmation: false },
  };
  return {
    intent: 'scheduling_request', state, stateRevision: 0, stateChanged: false, missingFields: [],
    readyForToolExecution: true, requiresHandoff: false, safetyDisposition: 'allowed',
    responsePlan: { kind: 'ready_for_tool', responseText: 'Consultando.', oneQuestionOnly: true },
    responseText: 'Consultando.', confidence: 'high', provider: 'fake', model: 'fake', usage: {}, latencyMs: 1,
  };
}

describe('AuraToolCoordinator', () => {
  it('passes only sanitized results to the response model and persists opaque selection state', async () => {
    const repository = new InMemoryAiConversationStateRepository();
    const executor: AiToolExecutor = { execute: vi.fn(async () => ({
      schemaVersion: 1, toolName: 'get_available_slots', kind: 'read', outcome: 'success',
      data: { professionalId: 'professional-secret', source: { recordId: 'knowledge-secret', table: 'clinic_locations' }, professional: { name: 'Dra. Ana' }, slots: [{ startAt: '2026-08-18T12:00:00.000Z' }] },
      presentedOptions: [{ id: 'slot-secret', value: '2026-08-18T12:00:00.000Z', label: 'ter., 18/08, 09:00', kind: 'time' }],
    })) };
    const composer: AiToolResponseComposer = { compose: vi.fn(async () => ({ text: 'Tenho 09:00 disponível. Você prefere esse horário?', provider: 'fake', model: 'fake', usage: {}, latencyMs: 1 })) };
    const coordinator = new AuraToolCoordinator(new ConversationStateToolPlanner(), executor, composer, repository);
    const result = await coordinator.executeIfPlanned(context, conversation(), config);
    expect(result?.text).toContain('09:00');
    const modelInput = vi.mocked(composer.compose).mock.calls[0][0];
    expect(JSON.stringify(modelInput)).not.toContain('professional-secret');
    expect(JSON.stringify(modelInput)).not.toContain('knowledge-secret');
    expect(JSON.stringify(modelInput)).not.toContain('slot-secret');
    expect(repository.snapshot().state.lastPresentedOptions[0].value).toBe('2026-08-18T12:00:00.000Z');
  });

  it('never plans a tool for a restricted medical turn', async () => {
    const executor: AiToolExecutor = { execute: vi.fn() };
    const composer: AiToolResponseComposer = { compose: vi.fn() };
    const restricted = { ...conversation(), safetyDisposition: 'clinical_content_restricted' as const };
    const result = await new AuraToolCoordinator(new ConversationStateToolPlanner(), executor, composer, new InMemoryAiConversationStateRepository())
      .executeIfPlanned(context, restricted, config);
    expect(result).toBeNull();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('persists completed state after a successful mutation', async () => {
    const current = conversation();
    current.state.entities.selectedOption = { value: '2026-08-18T12:00:00.000Z', source: 'user_text', confidence: 'high', requiresConfirmation: false };
    const repository = new InMemoryAiConversationStateRepository(current.state);
    const executor: AiToolExecutor = { execute: vi.fn(async () => ({ schemaVersion: 1, toolName: 'create_appointment', kind: 'mutation', outcome: 'success', data: { appointment: { startAt: '2026-08-18T12:00:00.000Z' } } })) };
    const composer: AiToolResponseComposer = { compose: vi.fn(async () => ({ text: 'Consulta agendada.', provider: 'fake', model: 'fake', usage: {}, latencyMs: 1 })) };
    await new AuraToolCoordinator(new ConversationStateToolPlanner(), executor, composer, repository).executeIfPlanned(context, current, config);
    expect(repository.snapshot().state.activeIntentStatus).toBe('completed');
  });

  it('stops before tool execution when a human takeover changes conversation control', async () => {
    const executor: AiToolExecutor = { execute: vi.fn() };
    const composer: AiToolResponseComposer = { compose: vi.fn() };
    const controlGuard = { canExecute: vi.fn(async () => false) };
    const coordinator = new AuraToolCoordinator(
      new ConversationStateToolPlanner(), executor, composer, new InMemoryAiConversationStateRepository(),
      undefined, undefined, undefined, controlGuard,
    );
    await expect(coordinator.executeIfPlanned(context, conversation(), config)).resolves.toBeNull();
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
