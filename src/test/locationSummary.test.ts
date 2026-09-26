import { describe, expect, it } from 'vitest';
import { formatLocationAddress, formatOperatingHoursSummary, hasConfiguredOperatingHours } from '@/components/settings/locationSummary';

describe('location summary for General settings', () => {
  it('formats a compact Monday-to-Friday summary', () => {
    expect(formatOperatingHoursSummary({
      schemaVersion: 1,
      weekdays: Object.fromEntries(['1', '2', '3', '4', '5'].map((day) => [day, [{ start: '08:00', end: '18:00' }]])),
    })).toBe('Seg–Sex • 08:00–18:00');
  });

  it('supports Saturday and split periods without exposing JSON', () => {
    expect(formatOperatingHoursSummary({
      schemaVersion: 1,
      weekdays: {
        '1': [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }],
        '6': [{ start: '09:00', end: '13:00' }],
      },
    })).toBe('Seg 08:00–12:00 / 13:00–18:00 • Sáb 09:00–13:00');
  });

  it('reports missing or empty schedules clearly', () => {
    expect(formatOperatingHoursSummary(null)).toBe('Horários não configurados');
    expect(formatOperatingHoursSummary({ schemaVersion: 1, weekdays: {} })).toBe('Fechado todos os dias');
    expect(hasConfiguredOperatingHours(null)).toBe(false);
    expect(hasConfiguredOperatingHours({ schemaVersion: 1, weekdays: {} })).toBe(false);
    expect(hasConfiguredOperatingHours({ schemaVersion: 1, weekdays: { '1': [{ start: '08:00', end: '18:00' }] } })).toBe(true);
  });

  it('keeps address ownership at location level', () => {
    expect(formatLocationAddress({ address_line: 'Av. Paulista, 1000', city: 'São Paulo', state: 'SP' }))
      .toBe('Av. Paulista, 1000 — São Paulo/SP');
    expect(formatLocationAddress({})).toBe('Endereço não informado');
  });
});
