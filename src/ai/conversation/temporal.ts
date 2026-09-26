import type { AiTemporalExpression } from '../domain/conversation.ts';

const WEEKDAYS: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function localDate(now: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-${value.day}T12:00:00.000Z`);
}

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function resolveTemporalExpression(raw: string, messageTimestamp: string, timezone: string): AiTemporalExpression {
  const text = normalized(raw);
  const base = localDate(new Date(messageTimestamp), timezone);
  const temporal: AiTemporalExpression = { raw, kind: 'relative_date', timezone };

  if (/depois de amanha/.test(text)) temporal.resolvedDate = isoDate(addDays(base, 2));
  else if (/\bamanha\b/.test(text)) temporal.resolvedDate = isoDate(addDays(base, 1));
  else if (/\bhoje\b/.test(text)) temporal.resolvedDate = isoDate(base);
  else {
    const weekday = Object.entries(WEEKDAYS).find(([name]) => new RegExp(`\\b${name}(?:-feira)?\\b`).test(text));
    if (weekday) {
      temporal.kind = 'weekday';
      temporal.weekday = weekday[1];
      if (/semana que vem/.test(text)) {
        const daysToMonday = ((1 - base.getUTCDay() + 7) % 7 || 7);
        temporal.resolvedDate = isoDate(addDays(base, daysToMonday + ((weekday[1] + 6) % 7)));
      } else {
        const delta = (weekday[1] - base.getUTCDay() + 7) % 7 || 7;
        temporal.resolvedDate = isoDate(addDays(base, delta));
      }
    } else if (/semana que vem/.test(text)) {
      temporal.kind = 'date_range';
      const daysToMonday = ((1 - base.getUTCDay() + 7) % 7 || 7);
      temporal.rangeStart = isoDate(addDays(base, daysToMonday));
      temporal.rangeEnd = isoDate(addDays(base, daysToMonday + 6));
    }
  }

  if (/\bmanha\b/.test(text)) temporal.timePreference = 'morning';
  if (/\btarde\b/.test(text)) temporal.timePreference = 'afternoon';
  if (/\b(noite|fim do dia)\b/.test(text)) temporal.timePreference = 'evening';
  if (/depois (?:d(?:a|e)s? )?(?:quatro|4)/.test(text)) temporal.afterTime = '16:00';
  if (/antes do almoco/.test(text)) temporal.beforeTime = '12:00';
  return temporal;
}
