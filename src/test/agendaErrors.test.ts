import { describe, expect, it } from 'vitest';
import { getAgendaErrorMessage } from '@/lib/agenda/errors';

describe('agenda transactional error contract', () => {
  it.each([
    ['AGENDA_SLOT_CONFLICT', 'Este horário acabou de ser ocupado. Escolha outro horário.'],
    ['AGENDA_OUTSIDE_OPERATING_HOURS', 'A unidade ou o profissional não atende neste horário.'],
    ['AGENDA_OUTSIDE_AVAILABILITY', 'Horário fora da disponibilidade do profissional.'],
    ['AGENDA_BLOCKED', 'Existe um bloqueio neste período.'],
    ['AGENDA_TREATMENT_NOT_OFFERED', 'O profissional não atende este serviço.'],
    ['AGENDA_PROFESSIONAL_NOT_AT_LOCATION', 'O profissional não atende nesta unidade.'],
  ])('maps %s to a friendly message', (code, expected) => {
    expect(getAgendaErrorMessage(new Error(`database: ${code}`))).toBe(expected);
  });

  it('preserves an unknown backend message', () => {
    expect(getAgendaErrorMessage(new Error('Falha específica'))).toBe('Falha específica');
  });

  it('extracts useful fields from a Supabase/PostgREST error object', () => {
    expect(getAgendaErrorMessage({
      message: 'Could not choose the best candidate function',
      details: 'Multiple functions match the request',
      code: 'PGRST203',
    })).toBe('Could not choose the best candidate function · Multiple functions match the request · PGRST203');
  });
});
