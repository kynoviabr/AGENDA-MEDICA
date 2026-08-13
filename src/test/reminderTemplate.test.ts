import { describe, expect, it } from 'vitest';
import { buildReminderMessage, normalizeWhatsappPhone } from '@/lib/agenda/reminderTemplate';

describe('reminderTemplate', () => {
  it('normaliza telefone para formato com DDI 55', () => {
    expect(normalizeWhatsappPhone('(11) 99999-0000')).toBe('5511999990000');
    expect(normalizeWhatsappPhone('551188887777')).toBe('551188887777');
    expect(normalizeWhatsappPhone('')).toBeNull();
  });

  it('monta mensagem de lembrete com token', () => {
    const message = buildReminderMessage({
      recipientName: 'Mariana',
      treatmentName: 'Avaliação',
      appointmentDateTimeLabel: '16/05/2026 às 09:00',
      token: 'abc999',
    });
    expect(message).toContain('Mariana');
    expect(message).toContain('CONFIRMAR #abc999');
    expect(message).toContain('CANCELAR #abc999');
  });
});
