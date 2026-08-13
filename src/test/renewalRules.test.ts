import { describe, expect, it } from 'vitest';
import { getRenewalAlertLevel, getRenewalTriggerThreshold, getSnoozeLimitDays } from '@/lib/renewal/rules';

describe('renewal rules', () => {
  it('calculates threshold for multiple sessions', () => {
    expect(getRenewalTriggerThreshold(10)).toBe(8);
    expect(getRenewalTriggerThreshold(4)).toBe(2);
  });

  it('applies special threshold for two or fewer sessions', () => {
    expect(getRenewalTriggerThreshold(2)).toBe(1);
    expect(getRenewalTriggerThreshold(1)).toBe(1);
  });

  it('maps alert levels by SLA days', () => {
    expect(getRenewalAlertLevel(1)).toBe('normal');
    expect(getRenewalAlertLevel(3)).toBe('warning');
    expect(getRenewalAlertLevel(7)).toBe('critical');
  });

  it('enforces max snooze limit', () => {
    expect(getSnoozeLimitDays()).toBe(30);
  });
});
