export function isValidWebhookToken(
  providedToken: string | null | undefined,
  expectedToken: string | null | undefined,
): boolean {
  const expected = String(expectedToken || '').trim();
  if (!expected) return true;
  const provided = String(providedToken || '').trim();
  return provided.length > 0 && provided === expected;
}

export function extractBearerToken(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  const raw = String(headerValue).trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return match[1]?.trim() || null;
}
