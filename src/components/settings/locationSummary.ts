import { validateWeeklyOperatingHours, type WeeklyOperatingHours } from '@/scheduling/operatingHours';

const weekdayLabels: Record<string, string> = {
  '0': 'Dom', '1': 'Seg', '2': 'Ter', '3': 'Qua', '4': 'Qui', '5': 'Sex', '6': 'Sáb',
};
const weekdayOrder = ['1', '2', '3', '4', '5', '6', '0'];

export interface LocationSummaryInput {
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  opening_hours?: unknown;
}

export function formatLocationAddress(location: LocationSummaryInput): string {
  const cityState = [location.city, location.state].filter(Boolean).join('/');
  return [location.address_line, cityState].filter(Boolean).join(' — ') || 'Endereço não informado';
}

export function hasConfiguredOperatingHours(value: unknown): boolean {
  const hours = value as WeeklyOperatingHours | null;
  return !!hours
    && validateWeeklyOperatingHours(hours).length === 0
    && Object.values(hours.weekdays).some((periods) => Array.isArray(periods) && periods.length > 0);
}

export function formatOperatingHoursSummary(value: unknown): string {
  const hours = value as WeeklyOperatingHours | null;
  if (!hours || validateWeeklyOperatingHours(hours).length > 0) return 'Horários não configurados';

  const openDays = weekdayOrder
    .map((weekday) => ({ weekday, periods: hours.weekdays[weekday as keyof typeof hours.weekdays] || [] }))
    .filter(({ periods }) => periods.length > 0);
  if (openDays.length === 0) return 'Fechado todos os dias';

  const periodText = (periods: typeof openDays[number]['periods']) => periods
    .map((period) => `${period.start}–${period.end}`)
    .join(' / ');
  const allSame = openDays.every(({ periods }) => periodText(periods) === periodText(openDays[0].periods));
  const positions = openDays.map(({ weekday }) => weekdayOrder.indexOf(weekday));
  const contiguous = positions.every((position, index) => index === 0 || position === positions[index - 1] + 1);

  if (allSame && contiguous) {
    const dayLabel = openDays.length === 1
      ? weekdayLabels[openDays[0].weekday]
      : `${weekdayLabels[openDays[0].weekday]}–${weekdayLabels[openDays.at(-1)!.weekday]}`;
    return `${dayLabel} • ${periodText(openDays[0].periods)}`;
  }

  const entries = openDays.map(({ weekday, periods }) => `${weekdayLabels[weekday]} ${periodText(periods)}`);
  return entries.length <= 3 ? entries.join(' • ') : `${entries.slice(0, 3).join(' • ')} • +${entries.length - 3} dias`;
}
