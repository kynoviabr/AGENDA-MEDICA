import { describe, expect, it } from 'vitest';
import { extractBearerToken, isValidWebhookToken } from '@/lib/agenda/webhookAuth';

describe('webhookAuth', () => {
  it('valida token correto', () => {
    expect(isValidWebhookToken('abc123', 'abc123')).toBe(true);
    expect(isValidWebhookToken('abc123', 'zzz')).toBe(false);
  });

  it('aceita quando token esperado não está configurado', () => {
    expect(isValidWebhookToken('', '')).toBe(true);
    expect(isValidWebhookToken(null, undefined)).toBe(true);
  });

  it('extrai bearer token', () => {
    expect(extractBearerToken('Bearer token_x1')).toBe('token_x1');
    expect(extractBearerToken('bearer xyz')).toBe('xyz');
    expect(extractBearerToken('token direto')).toBeNull();
  });
});
