import { describe, expect, it } from 'vitest';
import { buildAgendaRunKey } from '@/lib/agenda/jobRunKeys';

describe('buildAgendaRunKey', () => {
  const ref = new Date('2026-05-16T12:34:56.000Z');

  it('gera chave de morning', () => {
    expect(buildAgendaRunKey('morning', ref)).toBe('2026-05-16-09h');
  });

  it('gera chave de hourly', () => {
    expect(buildAgendaRunKey('hourly', ref)).toBe('2026-05-16-12h');
  });

  it('gera chave de manual', () => {
    expect(buildAgendaRunKey('manual', ref)).toBe('2026-05-16-manual-1234');
  });
});
