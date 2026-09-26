import { describe, expect, it } from 'vitest';
import {
  aggregateHealth, aggregateOperationalEvents, containsSensitiveOperationalData,
  isGlobalAiDisabled, normalizeOperationalCode, parseAppEnvironment,
  sanitizeOperationalError, sanitizeOperationalMetadata, summarizeLatency,
  type OperationalEvent,
} from '@/ai';

const context = { clinicId: 'clinic-synthetic', conversationId: 'conversation-synthetic', correlationId: 'correlation-synthetic', channel: 'whatsapp' as const, component: 'conversation' as const, startedAt: '2026-08-15T12:00:00Z' };

describe('Aura operational observability', () => {
  it('requires an explicit valid APP_ENV and parses the global switch', () => {
    expect(parseAppEnvironment('staging')).toBe('staging');
    expect(parseAppEnvironment('https://production.example')).toBe('unknown');
    expect(isGlobalAiDisabled('TRUE')).toBe(true);
    expect(isGlobalAiDisabled(undefined)).toBe(false);
  });

  it('stores only normalized error fields and never an exception message', () => {
    const result = sanitizeOperationalError({ code: 'provider timeout: Bearer secret-value', component: 'openai', category: 'provider_timeout', retryable: true, timestamp: '2026-08-15T12:00:00Z' });
    expect(result).toEqual({ code: 'UNKNOWN', component: 'openai', category: 'provider_timeout', retryable: true, timestamp: '2026-08-15T12:00:00Z' });
    expect(result).not.toHaveProperty('message');
    expect(result).not.toHaveProperty('stack');
  });

  it('allowlists metadata and removes secret, patient and message fields', () => {
    const result = sanitizeOperationalMetadata({ correlationId: 'corr-1', latencyMs: 24, body: 'texto do paciente', token: 'sk-secret', patientName: 'Pessoa Real', errorCode: 'AI_TIMEOUT' });
    expect(result).toEqual({ correlationId: 'corr-1', latencyMs: 24, errorCode: 'AI_TIMEOUT' });
    expect(containsSensitiveOperationalData('Authorization: Bearer abc.def')).toBe(true);
    expect(normalizeOperationalCode('AI timeout')).toBe('AI_TIMEOUT');
  });

  it('aggregates required health fail-closed', () => {
    const health = aggregateHealth([
      { key: 'database', state: 'healthy', required: true, code: 'OK' },
      { key: 'whatsapp', state: 'unhealthy', required: true, code: 'DOWN' },
      { key: 'optional', state: 'unknown', required: false, code: 'UNKNOWN' },
    ], '2026-08-15T12:00:00Z');
    expect(health.state).toBe('unhealthy');
  });

  it('calculates average, p50 and p95 without external calls', () => {
    expect(summarizeLatency([100, 20, 30, 40, 50])).toEqual({ count: 5, averageMs: 48, p50Ms: 40, p95Ms: 100 });
    expect(summarizeLatency([]).p95Ms).toBe(0);
  });

  it('aggregates PHI-free operational counters with correlation intact', () => {
    const event = (type: OperationalEvent['type'], outcome: OperationalEvent['outcome'], latencyMs?: number): OperationalEvent => ({ type, outcome, latencyMs, context, occurredAt: '2026-08-15T12:00:01Z' });
    const metrics = aggregateOperationalEvents([
      event('whatsapp_inbound_received', 'success'), event('ai_processing_completed', 'success', 100),
      event('tool_failure', 'failure', 20), event('handoff_requested', 'success'), event('outbound_failure', 'failure', 40),
    ]);
    expect(metrics).toMatchObject({ conversations: 1, inboundMessages: 1, aiResponses: 1, toolFailures: 1, handoffs: 1, outboundFailures: 1 });
    expect(metrics.latency).toEqual({ count: 3, averageMs: 53, p50Ms: 40, p95Ms: 100 });
  });
});
