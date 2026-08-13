export type Period = 'morning' | 'afternoon' | 'evening';

export function periodFromHour(hour: number): Period {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function slotMatchesPeriod(startIso: string, allowed: Period[]): boolean {
  const date = new Date(startIso);
  const period = periodFromHour(date.getHours());
  return allowed.length === 0 || allowed.includes(period);
}

export function normalizePreferredPeriods(raw: string[] | null | undefined): Period[] {
  const values = (raw || [])
    .map((value) => String(value).trim().toLowerCase())
    .filter((value): value is Period => value === 'morning' || value === 'afternoon' || value === 'evening');
  return Array.from(new Set(values));
}

export function minDurationWithBuffer(minutes: number, buffer = 10): number {
  return Math.max(1, minutes) + Math.max(0, buffer);
}
