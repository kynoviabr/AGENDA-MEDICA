import { describe, expect, it } from 'vitest';
import { AuraHandoffService } from '@/ai/handoff/AuraHandoffService.ts';
import { InMemoryAiHandoffRepository } from '@/ai/handoff/testing.ts';
import { buildDeterministicHandoffSummary } from '@/ai/handoff/summary.ts';
import { canReleaseAiOutbound, handoffPolicyForSafety, isAutomaticHandoffAllowed } from '@/ai/handoff/policies.ts';
import { sortHandoffQueue, shouldRunAiPipeline } from '@/ai/handoff/queue.ts';
import { createEmptyConversationState } from '@/ai/domain/conversation.ts';

const context = { clinicId: 'clinic-synthetic', conversationId: 'conversation-synthetic', correlationId: 'correlation-synthetic', channel: 'internal' as const };
const activeConfig = { engineMode: 'active' as const, enabled: true, validatedAt: '2026-08-16T00:00:00.000Z' };

describe('AuraHandoffService', () => {
  it('separates clinic engine mode from conversation control mode', async () => {
    const repository = new InMemoryAiHandoffRepository();
    const service = new AuraHandoffService(repository);
    expect((await service.assertAiActive(context)).mode).toBe('ai_active');
    repository.control = { ...repository.control, mode: 'human_active' };
    await expect(service.assertAiActive(context)).rejects.toMatchObject({ code: 'AI_CONVERSATION_SUSPENDED' });
    expect(shouldRunAiPipeline(repository.control)).toBe(false);
  });

  it('does not create automatic handoff in legacy, shadow, disabled or unvalidated mode', async () => {
    const repository = new InMemoryAiHandoffRepository();
    const service = new AuraHandoffService(repository);
    for (const config of [
      { ...activeConfig, engineMode: 'legacy' as const }, { ...activeConfig, engineMode: 'shadow' as const },
      { ...activeConfig, enabled: false }, { ...activeConfig, validatedAt: undefined },
    ]) expect(await service.requestAutomatic(context, config, { reason: 'policy_required', priority: 'normal', source: 'system' })).toBeNull();
    expect(repository.handoffs).toHaveLength(0);
  });

  it('creates one idempotent urgent handoff with deterministic summary', async () => {
    const repository = new InMemoryAiHandoffRepository();
    const service = new AuraHandoffService(repository, () => new Date('2026-08-16T12:00:00.000Z'));
    const state = createEmptyConversationState();
    state.entities.professional = { value: 'Dra. Ana Sintética', source: 'user_text', confidence: 'high', requiresConfirmation: false };
    const signal = { reason: 'urgent_language' as const, priority: 'urgent' as const, source: 'safety' as const, state };
    const first = await service.requestAutomatic(context, activeConfig, signal);
    const duplicate = await service.requestAutomatic(context, activeConfig, signal);
    expect(first?.id).toBe(duplicate?.id);
    expect(repository.handoffs).toHaveLength(1);
    expect(first).toMatchObject({ priority: 'urgent', status: 'queued' });
    expect(first?.summary.knownAdministrativeContext).toContain('Profissional: Dra. Ana Sintética');
  });

  it('creates handoff on the configured third consecutive failure and resets on success', async () => {
    const repository = new InMemoryAiHandoffRepository();
    const service = new AuraHandoffService(repository, undefined, 3);
    expect(await service.recordOperationalFailure(context, activeConfig, 'repeated_ambiguity')).toBeNull();
    expect(await service.recordOperationalFailure(context, activeConfig, 'repeated_ambiguity')).toBeNull();
    expect(await service.recordOperationalFailure(context, activeConfig, 'repeated_ambiguity')).toMatchObject({ reason: 'repeated_ambiguity' });
    repository.control = { ...repository.control, mode: 'ai_active', failureCount: 2, activeHandoffId: undefined };
    repository.handoffs.length = 0;
    await service.recordSuccess(context);
    expect(repository.control.failureCount).toBe(0);
  });

  it('maps urgent safety and never treats priority as clinical triage', () => {
    expect(handoffPolicyForSafety('require_handoff', ['emergency_language'])).toEqual({ reason: 'urgent_language', priority: 'urgent', source: 'safety' });
    expect(handoffPolicyForSafety('allow', [])).toBeNull();
    expect(isAutomaticHandoffAllowed(activeConfig)).toBe(true);
  });

  it('rechecks the outbound fence and prevents AI/human double response', () => {
    const normal = { requiresHandoff: false };
    expect(canReleaseAiOutbound({ mode: 'ai_active' }, normal)).toBe(true);
    expect(canReleaseAiOutbound({ mode: 'human_active', activeHandoffId: 'h1' }, normal)).toBe(false);
    expect(canReleaseAiOutbound({ mode: 'handoff_pending', activeHandoffId: 'h1' }, { requiresHandoff: true, handoffOperational: true, handoffId: 'h1' })).toBe(true);
    expect(canReleaseAiOutbound({ mode: 'human_active', activeHandoffId: 'h1' }, { requiresHandoff: true, handoffOperational: true, handoffId: 'h1' })).toBe(false);
  });

  it('sanitizes summary identifiers and sorts queue by operational priority/time', () => {
    const state = createEmptyConversationState();
    state.entities.service = { value: 'CPF 123.456.789-09 ref 123e4567-e89b-12d3-a456-426614174000', source: 'user_text', confidence: 'high', requiresConfirmation: false };
    const summary = buildDeterministicHandoffSummary({ reason: 'other', state });
    expect(JSON.stringify(summary)).not.toContain('123.456.789-09');
    expect(JSON.stringify(summary)).not.toContain('123e4567');
    const repository = new InMemoryAiHandoffRepository();
    const base = { clinicId: 'c', conversationId: 'x', reason: 'other' as const, source: 'system' as const, status: 'queued' as const, summary };
    expect(sortHandoffQueue([
      { ...base, id: 'normal', priority: 'normal', requestedAt: '2026-08-16T10:00:00Z' },
      { ...base, id: 'urgent', priority: 'urgent', requestedAt: '2026-08-16T11:00:00Z' },
    ])[0].id).toBe('urgent');
    void repository;
  });
});
