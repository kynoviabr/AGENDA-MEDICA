import type { OperationalComponent, OperationalErrorCategory, SanitizedOperationalError } from './domain.ts';

const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,79}$/;
const SECRET_PATTERN = /(?:bearer\s+[\w.-]+|sb_(?:secret|publishable)_[\w-]+|sk-[\w-]+|api[_-]?key|service[_-]?role|access[_-]?token|refresh[_-]?token|password|secret)/i;
const PERSONAL_PATTERN = /(?:\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\+?55\s?\(?\d{2}\)?\s?9?\d{4}[- ]?\d{4}\b|message|prompt|transcript|patient|phone|cpf|body|name)/i;

export function normalizeOperationalCode(value: unknown, fallback = 'UNKNOWN') {
  const candidate = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80);
  return CODE_PATTERN.test(candidate) && !SECRET_PATTERN.test(candidate) ? candidate : fallback;
}

export function sanitizeOperationalError(input: {
  code?: unknown;
  component: OperationalComponent;
  category?: OperationalErrorCategory;
  retryable?: boolean;
  timestamp?: string;
}): SanitizedOperationalError {
  return {
    code: normalizeOperationalCode(input.code),
    component: input.component,
    category: input.category || 'unknown',
    retryable: input.retryable === true,
    timestamp: input.timestamp || new Date().toISOString(),
  };
}

const SAFE_METADATA_KEYS = new Set(['correlationId', 'clinicId', 'conversationId', 'component', 'eventType', 'outcome', 'errorCode', 'latencyMs', 'messageType', 'count']);

export function sanitizeOperationalMetadata(input: Record<string, unknown>) {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_METADATA_KEYS.has(key) || SECRET_PATTERN.test(key) || PERSONAL_PATTERN.test(key)) continue;
    if (typeof value === 'string') {
      if (SECRET_PATTERN.test(value) || PERSONAL_PATTERN.test(value)) continue;
      output[key] = value.slice(0, 120);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) output[key] = value;
  }
  return output;
}

export function containsSensitiveOperationalData(value: unknown) {
  return SECRET_PATTERN.test(String(value || '')) || PERSONAL_PATTERN.test(String(value || ''));
}
