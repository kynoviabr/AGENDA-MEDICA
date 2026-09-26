import type { LatencySummary, OperationalEvent, OperationalMetrics } from './domain.ts';

export function summarizeLatency(values: readonly number[]): LatencySummary {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, averageMs: 0, p50Ms: 0, p95Ms: 0 };
  const percentile = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
  return {
    count: sorted.length,
    averageMs: Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50Ms: percentile(0.5), p95Ms: percentile(0.95),
  };
}

export function aggregateOperationalEvents(events: readonly OperationalEvent[]): OperationalMetrics {
  const count = (type: OperationalEvent['type'], outcome?: OperationalEvent['outcome']) => events.filter((event) => event.type === type && (!outcome || event.outcome === outcome)).length;
  return {
    conversations: new Set(events.map((event) => event.context.conversationId).filter(Boolean)).size,
    inboundMessages: count('whatsapp_inbound_received'),
    aiResponses: count('ai_processing_completed', 'success'), aiFailures: count('ai_processing_failed'),
    toolCalls: count('tool_execution'), toolFailures: count('tool_failure'),
    mutationAttempts: 0, mutationSuccesses: 0, mutationFailures: 0,
    knowledge: { answered: 0, not_found: 0, ambiguous: 0, restricted: 0 },
    safety: { allow: 0, rewrite_safe: 0, block: 0, require_clarification: 0, require_handoff: 0 },
    handoffs: count('handoff_requested'), humanTakeovers: count('handoff_accepted'),
    outboundFailures: count('outbound_failure'),
    latency: summarizeLatency(events.flatMap((event) => event.latencyMs === undefined ? [] : [event.latencyMs])),
  };
}
