export type RenewalAlertLevel = 'normal' | 'warning' | 'critical';

export function getRenewalTriggerThreshold(totalSessions: number) {
  const total = Math.max(1, Math.floor(totalSessions || 1));
  if (total <= 2) return 1;
  return Math.max(total - 2, 1);
}

export function getRenewalAlertLevel(daysSinceLastAction: number): RenewalAlertLevel {
  if (daysSinceLastAction >= 7) return 'critical';
  if (daysSinceLastAction >= 3) return 'warning';
  return 'normal';
}

export function getSnoozeLimitDays() {
  return 30;
}
