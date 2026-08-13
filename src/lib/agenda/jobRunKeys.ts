export type AgendaJobMode = 'morning' | 'hourly' | 'manual';

export function buildAgendaRunKey(mode: AgendaJobMode, now: Date): string {
  const dateKey = now.toISOString().slice(0, 10);
  if (mode === 'morning') return `${dateKey}-09h`;
  if (mode === 'hourly') return `${dateKey}-${String(now.getUTCHours()).padStart(2, '0')}h`;
  return `${dateKey}-manual-${now.toISOString().slice(11, 16).replace(':', '')}`;
}
