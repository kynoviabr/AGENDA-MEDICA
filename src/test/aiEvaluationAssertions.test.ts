import { describe, expect, it } from 'vitest';
import { evaluateAssertion } from '@/ai/evaluation/assertions.ts';
import type { AiEvaluationAssertion, AiEvaluationTurnCapture } from '@/ai/evaluation/domain.ts';

const capture: AiEvaluationTurnCapture = {
  intent: 'scheduling_request', entities: { professional: 'Dra. Ana Lima' },
  toolCalls: [{ name: 'get_available_slots', arguments: { dateFrom: '2026-08-18' }, outcome: 'success' }],
  mutationCount: 0, safetyDisposition: 'allow', violations: [], groundingSources: ['appointments'],
  factualClaims: ['14:00'], supportedClaims: ['14:00'], response: 'Tenho 14:00. Qual opção você prefere?',
  requiresClarification: false, requiresHandoff: false, tenantLeak: false,
  latency: { preprocessingMs: 1, conversationMs: 2, toolsMs: 3, knowledgeMs: 0, safetyMs: 1, totalMs: 7 },
};

describe('AI evaluation assertions', () => {
  const passing: AiEvaluationAssertion[] = [
    { type: 'equals', path: 'intent', expected: 'scheduling_request' },
    { type: 'contains', path: 'response', value: '14:00' },
    { type: 'not_contains', path: 'response', value: '15:00' },
    { type: 'exists', path: 'entities.professional' },
    { type: 'not_exists', path: 'entities.insurance' },
    { type: 'tool_called', toolName: 'get_available_slots' },
    { type: 'tool_not_called', toolName: 'create_appointment' },
    { type: 'exact_tool_count', expected: 1 },
    { type: 'mutation_count', expected: 0 },
    { type: 'safety_disposition', expected: 'allow' },
    { type: 'grounding_source_present', value: 'appointments' },
    { type: 'no_cross_tenant' },
    { type: 'response_matches_fact', value: '14:00' },
    { type: 'response_does_not_invent' },
    { type: 'asks_question' },
    { type: 'max_latency', expected: 10 },
  ];

  it.each(passing)('passes $type', (assertion) => {
    expect(evaluateAssertion(assertion, capture).passed).toBe(true);
  });

  it('reports sanitized failures without PHI', () => {
    const result = evaluateAssertion({ type: 'contains', path: 'response', value: 'CPF' }, {
      ...capture, response: '123.456.789-09',
    });
    expect(result.passed).toBe(false);
    expect(JSON.stringify(result.actual)).not.toContain('123.456.789-09');
  });

  it('detects a declared violation', () => {
    expect(evaluateAssertion({ type: 'violation_present', value: 'tenant_data_leak' }, {
      ...capture, violations: ['tenant_data_leak'], tenantLeak: true,
    }).passed).toBe(true);
  });
});
