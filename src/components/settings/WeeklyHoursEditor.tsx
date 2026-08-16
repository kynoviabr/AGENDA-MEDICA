import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OperatingPeriod, SchedulingWeekday, WeeklyOperatingHours } from '@/scheduling/operatingHours';

const weekdays: Array<{ value: SchedulingWeekday; label: string }> = [
  { value: 1, label: 'Segunda-feira' }, { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' }, { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' }, { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

interface WeeklyHoursEditorProps {
  value: WeeklyOperatingHours;
  onChange: (value: WeeklyOperatingHours) => void;
  disabled?: boolean;
  idPrefix: string;
}

export default function WeeklyHoursEditor({ value, onChange, disabled, idPrefix }: WeeklyHoursEditorProps) {
  const setPeriods = (weekday: SchedulingWeekday, periods: OperatingPeriod[]) => onChange({
    schemaVersion: 1,
    weekdays: { ...value.weekdays, [String(weekday)]: periods },
  });
  const appendPeriod = (weekday: SchedulingWeekday, periods: OperatingPeriod[]) => {
    const lastEnd = [...periods].sort((left, right) => left.end.localeCompare(right.end)).at(-1)?.end || '08:00';
    const [hour, minute] = lastEnd.split(':').map(Number);
    const nextEndMinutes = Math.min(23 * 60 + 59, hour * 60 + minute + 60);
    setPeriods(weekday, [...periods, {
      start: lastEnd,
      end: `${String(Math.floor(nextEndMinutes / 60)).padStart(2, '0')}:${String(nextEndMinutes % 60).padStart(2, '0')}`,
    }]);
  };

  return (
    <div className="space-y-3">
      {weekdays.map((day) => {
        const key = String(day.value) as `${SchedulingWeekday}`;
        const periods = value.weekdays[key] || [];
        const enabled = periods.length > 0;
        return (
          <fieldset key={day.value} className="rounded-lg border p-3" disabled={disabled}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${idPrefix}-${day.value}-enabled`}
                  checked={enabled}
                  onCheckedChange={(checked) => setPeriods(day.value, checked ? [{ start: '08:00', end: '18:00' }] : [])}
                />
                <Label htmlFor={`${idPrefix}-${day.value}-enabled`} className="font-medium">{day.label}</Label>
              </div>
              {enabled && periods.length < 6 && periods.every((period) => period.end < '23:59') && (
                <Button type="button" size="sm" variant="ghost" onClick={() => appendPeriod(day.value, periods)}>
                  <Plus className="mr-1 h-4 w-4" />Adicionar período
                </Button>
              )}
            </div>
            {enabled && (
              <div className="mt-3 space-y-2">
                {periods.map((period, index) => (
                  <div key={`${day.value}-${index}`} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                    <div>
                      <Label className="sr-only" htmlFor={`${idPrefix}-${day.value}-${index}-start`}>Início de {day.label}, período {index + 1}</Label>
                      <Input id={`${idPrefix}-${day.value}-${index}-start`} type="time" value={period.start} onChange={(event) => setPeriods(day.value, periods.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item))} />
                    </div>
                    <span className="text-sm text-muted-foreground">até</span>
                    <div>
                      <Label className="sr-only" htmlFor={`${idPrefix}-${day.value}-${index}-end`}>Fim de {day.label}, período {index + 1}</Label>
                      <Input id={`${idPrefix}-${day.value}-${index}-end`} type="time" value={period.end} onChange={(event) => setPeriods(day.value, periods.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item))} />
                    </div>
                    <Button type="button" size="icon" variant="ghost" aria-label={`Remover período ${index + 1} de ${day.label}`} onClick={() => setPeriods(day.value, periods.filter((_, itemIndex) => itemIndex !== index))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
