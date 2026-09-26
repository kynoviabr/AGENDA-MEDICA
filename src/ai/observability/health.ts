import type { HealthCheckResult, HealthSummary, OperationalHealthState } from './domain.ts';

const ORDER: Record<OperationalHealthState, number> = { healthy: 0, unknown: 1, degraded: 2, unhealthy: 3 };

export function aggregateHealth(checks: readonly HealthCheckResult[], checkedAt = new Date().toISOString()): HealthSummary {
  const required = checks.filter((check) => check.required);
  const source = required.length ? required : checks;
  const state = source.reduce<OperationalHealthState>((current, check) => ORDER[check.state] > ORDER[current] ? check.state : current, 'healthy');
  return { state, checks: [...checks], checkedAt };
}
