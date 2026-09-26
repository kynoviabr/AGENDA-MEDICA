import { describe, expect, it } from 'vitest';
import { WorkingHoursPolicy, validateWeeklyOperatingHours, type WeeklyOperatingHours } from '@/scheduling/operatingHours';

const mondayToFriday: WeeklyOperatingHours = {
  schemaVersion: 1,
  weekdays: {
    '1': [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }],
    '2': [{ start: '08:00', end: '18:00' }],
    '3': [{ start: '08:00', end: '18:00' }],
    '4': [{ start: '08:00', end: '18:00' }],
    '5': [{ start: '08:00', end: '18:00' }],
  },
};

describe('WorkingHoursPolicy', () => {
  const policy = new WorkingHoursPolicy();

  it('keeps only Monday through Friday visible', () => {
    expect(policy.getVisibleWeekDays(
      ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22'],
      mondayToFriday,
    )).toEqual(['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']);
  });

  it('shows six operational columns for a Monday-to-Saturday unit and reacts to location rules', () => {
    const mondayToSaturday: WeeklyOperatingHours = {
      ...mondayToFriday,
      weekdays: { ...mondayToFriday.weekdays, '6': [{ start: '09:00', end: '13:00' }] },
    };
    const week = ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22'];
    expect(policy.getVisibleWeekDays(week, mondayToSaturday)).toHaveLength(6);
    expect(policy.getVisibleWeekDays(week, mondayToFriday)).toHaveLength(5);
  });

  it('supports split lunch hours and interval intersection', () => {
    expect(policy.getEffectiveWorkingPeriods({
      date: '2026-08-17',
      locationHours: mondayToFriday,
      professionalHours: { '1': [{ start: '10:00', end: '16:00' }] },
    })).toEqual([{ start: '10:00', end: '12:00' }, { start: '13:00', end: '16:00' }]);
  });

  it('clips a professional period to the location boundary', () => {
    expect(policy.getEffectiveWorkingPeriods({
      date: '2026-08-18',
      locationHours: mondayToFriday,
      professionalHours: { '2': [{ start: '07:00', end: '12:00' }] },
    })).toEqual([{ start: '08:00', end: '12:00' }]);
  });

  it('applies holiday, special hours and professional day off precedence', () => {
    expect(policy.getLocationOperatingPeriods('2026-08-17', mondayToFriday, [
      { date: '2026-08-17', closed: true, kind: 'holiday' },
    ])).toEqual([]);
    expect(policy.getLocationOperatingPeriods('2026-08-17', mondayToFriday, [
      { date: '2026-08-17', closed: false, periods: [{ start: '10:00', end: '14:00' }], kind: 'special_hours' },
    ])).toEqual([{ start: '10:00', end: '14:00' }]);
    expect(policy.getEffectiveWorkingPeriods({
      date: '2026-08-17', locationHours: mondayToFriday,
      professionalHours: { '1': [{ start: '08:00', end: '18:00' }] },
      professionalExceptions: [{ date: '2026-08-17', closed: true, kind: 'day_off' }],
    })).toEqual([]);
  });

  it('keeps an existing appointment visible on a normally closed day', () => {
    expect(policy.getVisibleWeekDays(['2026-08-16'], mondayToFriday, [], new Set(['2026-08-16']))).toEqual(['2026-08-16']);
  });

  it('derives the visible time range', () => {
    expect(policy.getVisibleTimeRange([
      { start: '09:00', end: '13:00' }, { start: '08:00', end: '19:00' },
    ])).toEqual({ start: '08:00', end: '19:00' });
  });

  it('uses the location timezone when filtering provider instants', () => {
    const periods = new Map([['2026-08-17', [{ start: '08:00', end: '18:00' }]]]);
    expect(policy.isInstantInsidePeriods('2026-08-17T11:00:00.000Z', 'America/Sao_Paulo', periods)).toBe(true);
    expect(policy.isInstantInsidePeriods('2026-08-17T09:00:00.000Z', 'America/Sao_Paulo', periods)).toBe(false);
  });

  it('rejects overlapping recurring periods', () => {
    expect(validateWeeklyOperatingHours({
      schemaVersion: 1,
      weekdays: { '1': [{ start: '08:00', end: '12:00' }, { start: '11:30', end: '18:00' }] },
    })).toContain('Os períodos do mesmo dia não podem se sobrepor.');
  });
});
