import type {
  AiEvaluationAssertion,
  AiEvaluationAssertionResult,
  AiEvaluationTurnCapture,
} from './domain.ts';

export function evaluateAssertion(
  assertion: AiEvaluationAssertion,
  capture: AiEvaluationTurnCapture,
): AiEvaluationAssertionResult {
  const actual = assertion.path ? readPath(capture, assertion.path) : undefined;
  let passed = false;
  let expected: unknown = assertion.expected ?? assertion.value ?? assertion.toolName;

  switch (assertion.type) {
    case 'equals': passed = deepEqual(actual, assertion.expected); break;
    case 'contains': passed = contains(actual, assertion.value ?? String(assertion.expected ?? '')); break;
    case 'not_contains': passed = !contains(actual, assertion.value ?? String(assertion.expected ?? '')); break;
    case 'exists': passed = actual !== undefined && actual !== null; expected = 'exists'; break;
    case 'not_exists': passed = actual === undefined || actual === null; expected = 'not exists'; break;
    case 'tool_called': passed = capture.toolCalls.some((item) => item.name === assertion.toolName); break;
    case 'tool_not_called': passed = !capture.toolCalls.some((item) => item.name === assertion.toolName); break;
    case 'exact_tool_count': passed = capture.toolCalls.length === Number(assertion.expected); break;
    case 'mutation_count': passed = capture.mutationCount === Number(assertion.expected); break;
    case 'safety_disposition': passed = capture.safetyDisposition === assertion.expected; break;
    case 'violation_present': passed = capture.violations.includes(assertion.value as never); break;
    case 'grounding_source_present': passed = capture.groundingSources.includes(assertion.value ?? ''); break;
    case 'no_cross_tenant': passed = !capture.tenantLeak; expected = false; break;
    case 'response_matches_fact': passed = capture.supportedClaims.includes(assertion.value ?? ''); break;
    case 'response_does_not_invent': passed = capture.factualClaims.every((item) => capture.supportedClaims.includes(item)); expected = 'all claims supported'; break;
    case 'asks_question': passed = capture.response.trim().endsWith('?'); expected = true; break;
    case 'max_latency': passed = capture.latency.totalMs <= Number(assertion.expected); break;
  }

  const resolvedActual = assertion.type === 'safety_disposition' ? capture.safetyDisposition
    : assertion.type === 'max_latency' ? capture.latency.totalMs
    : assertion.type === 'mutation_count' ? capture.mutationCount
    : assertion.type === 'exact_tool_count' ? capture.toolCalls.length
    : assertion.type === 'no_cross_tenant' ? capture.tenantLeak
    : actual;
  return {
    assertion, passed, expected, actual: sanitizeTraceValue(resolvedActual),
    message: passed ? 'ok' : (assertion.description || `${assertion.type} failed`),
  };
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function contains(actual: unknown, expected: string) {
  if (Array.isArray(actual)) return actual.some((item) => String(item).includes(expected));
  return String(actual ?? '').includes(expected);
}

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sanitizeTraceValue(value: unknown): unknown {
  if (typeof value === 'string') return value.slice(0, 200)
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[redacted]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[internal-id]');
  if (Array.isArray(value)) return value.slice(0, 10).map(sanitizeTraceValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/phone|cpf|token|secret|prompt/i.test(key))
    .map(([key, item]) => [key, sanitizeTraceValue(item)]));
  return value;
}
