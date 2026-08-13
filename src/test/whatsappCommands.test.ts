import { describe, expect, it } from 'vitest';
import { parseWhatsappCommand } from '@/lib/agenda/whatsappCommands';

describe('parseWhatsappCommand', () => {
  it('detecta confirmação com token', () => {
    const parsed = parseWhatsappCommand('Confirmar #ABC12345');
    expect(parsed.action).toBe('confirm');
    expect(parsed.token).toBe('ABC12345');
  });

  it('detecta cancelamento', () => {
    const parsed = parseWhatsappCommand('Quero cancelar #TOKEN9988');
    expect(parsed.action).toBe('cancel');
    expect(parsed.token).toBe('TOKEN9988');
  });

  it('detecta remarcação', () => {
    const parsed = parseWhatsappCommand('Preciso remarcar #REM0001');
    expect(parsed.action).toBe('reschedule');
  });

  it('retorna unknown quando não reconhece comando', () => {
    const parsed = parseWhatsappCommand('Bom dia, tenho dúvida');
    expect(parsed.action).toBe('unknown');
    expect(parsed.token).toBeNull();
  });
});
