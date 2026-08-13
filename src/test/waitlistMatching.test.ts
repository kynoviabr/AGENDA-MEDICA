import { describe, expect, it } from 'vitest';
import {
  minDurationWithBuffer,
  normalizePreferredPeriods,
  periodFromHour,
  slotMatchesPeriod,
} from '@/lib/agenda/waitlistMatching';

describe('waitlist matching helpers', () => {
  it('maps hour to expected period', () => {
    expect(periodFromHour(9)).toBe('morning');
    expect(periodFromHour(14)).toBe('afternoon');
    expect(periodFromHour(20)).toBe('evening');
  });

  it('normalizes preferred periods defensively', () => {
    expect(normalizePreferredPeriods(['Morning', 'afternoon', 'invalid', 'afternoon'])).toEqual(['morning', 'afternoon']);
    expect(normalizePreferredPeriods(null)).toEqual([]);
  });

  it('matches slot period against allowed periods', () => {
    expect(slotMatchesPeriod('2026-06-10T09:00:00Z', ['morning'])).toBe(true);
    expect(slotMatchesPeriod('2026-06-10T15:00:00Z', ['morning'])).toBe(false);
    expect(slotMatchesPeriod('2026-06-10T15:00:00Z', [])).toBe(true);
  });

  it('applies minimum duration plus buffer', () => {
    expect(minDurationWithBuffer(60)).toBe(70);
    expect(minDurationWithBuffer(0)).toBe(11);
    expect(minDurationWithBuffer(45, 0)).toBe(45);
  });
});
