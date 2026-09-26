import type { OperatingPeriod, SchedulingWeekday, WeeklyOperatingHours } from '@/scheduling/operatingHours';

export interface ActiveLinkState {
  targetId: string;
  active: boolean;
}

export interface ActiveLinkChanges {
  activate: string[];
  deactivate: string[];
}

export interface AvailabilityRowLike {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export function getActiveLinkChanges(existing: readonly ActiveLinkState[], selectedIds: readonly string[]): ActiveLinkChanges {
  const selected = new Set(selectedIds);
  const active = new Set(existing.filter((item) => item.active).map((item) => item.targetId));
  return {
    activate: [...selected].filter((id) => !active.has(id)),
    deactivate: [...active].filter((id) => !selected.has(id)),
  };
}

export function availabilityRowsToWeeklyHours(rows: readonly AvailabilityRowLike[]): WeeklyOperatingHours {
  const weekdays: WeeklyOperatingHours['weekdays'] = {};
  rows.forEach((row) => {
    const weekday = row.day_of_week as SchedulingWeekday;
    const key = String(weekday) as `${SchedulingWeekday}`;
    const period: OperatingPeriod = { start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) };
    weekdays[key] = [...(weekdays[key] || []), period].sort((left, right) => left.start.localeCompare(right.start));
  });
  return { schemaVersion: 1, weekdays };
}

export function weeklyHoursToAvailabilityRows(
  hours: WeeklyOperatingHours,
  clinicId: string,
  professionalId: string,
  locationId: string,
) {
  return (Object.entries(hours.weekdays) as Array<[`${SchedulingWeekday}`, OperatingPeriod[]]>).flatMap(([weekday, periods]) =>
    periods.map((period) => ({
      clinic_id: clinicId,
      professional_id: professionalId,
      location_id: locationId,
      day_of_week: Number(weekday),
      start_time: period.start,
      end_time: period.end,
      is_active: true,
    })),
  );
}
