import type { AppEnvironment } from './domain.ts';

export function parseAppEnvironment(value?: string | null): AppEnvironment {
  return value === 'local' || value === 'staging' || value === 'production' ? value : 'unknown';
}

export function isGlobalAiDisabled(value?: string | null) {
  return value?.trim().toLowerCase() === 'true' || value === '1';
}
