import type { IanaTimezone, IsoInstant } from '../domain/time.ts';

export type SchedulingWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface OperatingPeriod {
  start: string;
  end: string;
}

export interface WeeklyOperatingHours {
  schemaVersion: 1;
  weekdays: Partial<Record<`${SchedulingWeekday}`, OperatingPeriod[]>>;
}

export const emptyWeeklyHours = (): WeeklyOperatingHours => ({ schemaVersion: 1, weekdays: {} });

export type ScheduleExceptionKind = 'holiday' | 'day_off' | 'special_hours' | 'other';

export interface ScheduleException {
  date: string;
  closed: boolean;
  periods?: OperatingPeriod[];
  kind: ScheduleExceptionKind;
  reason?: string;
}

export interface EffectiveWorkingPeriodsInput {
  date: string;
  locationHours: WeeklyOperatingHours | null | undefined;
  professionalHours: Partial<Record<`${SchedulingWeekday}`, OperatingPeriod[]>>;
  locationExceptions?: readonly ScheduleException[];
  professionalExceptions?: readonly ScheduleException[];
}

export interface VisibleTimeRange {
  start: string;
  end: string;
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function minutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function toTime(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

export function isIanaTimezone(value: string): value is IanaTimezone {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function weekdayFromIsoDate(date: string): SchedulingWeekday {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() as SchedulingWeekday;
}

export function validatePeriods(periods: readonly OperatingPeriod[], maximumPeriods = 6): string[] {
  const errors: string[] = [];
  if (periods.length > maximumPeriods) errors.push(`Máximo de ${maximumPeriods} períodos por dia.`);
  const sorted = [...periods].sort((left, right) => minutes(left.start) - minutes(right.start));

  sorted.forEach((period, index) => {
    if (!TIME_PATTERN.test(period.start) || !TIME_PATTERN.test(period.end)) {
      errors.push('Horário inválido; use HH:mm.');
      return;
    }
    if (minutes(period.end) <= minutes(period.start)) errors.push('O horário final deve ser posterior ao inicial.');
    if (index > 0 && minutes(period.start) < minutes(sorted[index - 1].end)) errors.push('Os períodos do mesmo dia não podem se sobrepor.');
  });

  return Array.from(new Set(errors));
}

export function validateWeeklyOperatingHours(hours: WeeklyOperatingHours | null | undefined): string[] {
  if (!hours) return ['Horário de funcionamento não configurado.'];
  if (hours.schemaVersion !== 1 || !hours.weekdays || typeof hours.weekdays !== 'object') return ['Formato de horário de funcionamento inválido.'];
  return (Object.entries(hours.weekdays) as Array<[string, OperatingPeriod[]]>).flatMap(([weekday, periods]) => {
    if (!/^[0-6]$/.test(weekday) || !Array.isArray(periods)) return ['Dia da semana inválido.'];
    return validatePeriods(periods);
  });
}

export function intersectPeriods(left: readonly OperatingPeriod[], right: readonly OperatingPeriod[]): OperatingPeriod[] {
  const intersections: OperatingPeriod[] = [];
  for (const first of left) {
    for (const second of right) {
      const start = Math.max(minutes(first.start), minutes(second.start));
      const end = Math.min(minutes(first.end), minutes(second.end));
      if (start < end) intersections.push({ start: toTime(start), end: toTime(end) });
    }
  }
  return intersections.sort((a, b) => minutes(a.start) - minutes(b.start));
}

function periodsForDate(
  date: string,
  recurring: Partial<Record<`${SchedulingWeekday}`, OperatingPeriod[]>>,
  exceptions: readonly ScheduleException[],
): OperatingPeriod[] {
  const exception = exceptions.find((item) => item.date === date);
  if (exception?.closed) return [];
  if (exception?.periods) return exception.periods;
  return recurring[String(weekdayFromIsoDate(date)) as `${SchedulingWeekday}`] || [];
}

export class WorkingHoursPolicy {
  getLocationOperatingPeriods(
    date: string,
    hours: WeeklyOperatingHours | null | undefined,
    exceptions: readonly ScheduleException[] = [],
  ): OperatingPeriod[] {
    if (!hours || validateWeeklyOperatingHours(hours).length > 0) return [];
    return periodsForDate(date, hours.weekdays, exceptions);
  }

  isLocationOpen(date: string, hours: WeeklyOperatingHours | null | undefined, exceptions: readonly ScheduleException[] = []): boolean {
    return this.getLocationOperatingPeriods(date, hours, exceptions).length > 0;
  }

  getProfessionalWorkingPeriods(
    date: string,
    hours: Partial<Record<`${SchedulingWeekday}`, OperatingPeriod[]>>,
    exceptions: readonly ScheduleException[] = [],
  ): OperatingPeriod[] {
    return periodsForDate(date, hours, exceptions);
  }

  isProfessionalWorking(
    date: string,
    hours: Partial<Record<`${SchedulingWeekday}`, OperatingPeriod[]>>,
    exceptions: readonly ScheduleException[] = [],
  ): boolean {
    return this.getProfessionalWorkingPeriods(date, hours, exceptions).length > 0;
  }

  getEffectiveWorkingPeriods(input: EffectiveWorkingPeriodsInput): OperatingPeriod[] {
    return intersectPeriods(
      this.getLocationOperatingPeriods(input.date, input.locationHours, input.locationExceptions),
      this.getProfessionalWorkingPeriods(input.date, input.professionalHours, input.professionalExceptions),
    );
  }

  getVisibleWeekDays(
    dates: readonly string[],
    hours: WeeklyOperatingHours | null | undefined,
    exceptions: readonly ScheduleException[] = [],
    datesWithExistingEvents: ReadonlySet<string> = new Set(),
  ): string[] {
    return dates.filter((date) => this.isLocationOpen(date, hours, exceptions) || datesWithExistingEvents.has(date));
  }

  getVisibleTimeRange(periods: readonly OperatingPeriod[]): VisibleTimeRange | null {
    if (periods.length === 0) return null;
    return {
      start: periods.reduce((earliest, period) => minutes(period.start) < minutes(earliest) ? period.start : earliest, periods[0].start),
      end: periods.reduce((latest, period) => minutes(period.end) > minutes(latest) ? period.end : latest, periods[0].end),
    };
  }

  isInstantInsidePeriods(instant: IsoInstant, timezone: IanaTimezone, periodsByDate: ReadonlyMap<string, readonly OperatingPeriod[]>): boolean {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = `${value.year}-${value.month}-${value.day}`;
    const time = `${value.hour}:${value.minute}`;
    return (periodsByDate.get(date) || []).some((period) => minutes(period.start) <= minutes(time) && minutes(time) < minutes(period.end));
  }
}

export const workingHoursPolicy = new WorkingHoursPolicy();
