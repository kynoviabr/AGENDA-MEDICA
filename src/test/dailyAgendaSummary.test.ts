import { describe, expect, it } from 'vitest';
import { buildDailyAgendaSummary } from '@/lib/agenda/dailyAgendaSummary';

describe('buildDailyAgendaSummary', () => {
  it('consolida status e tipo de agendamento', () => {
    const summary = buildDailyAgendaSummary([
      { status: 'scheduled', appointment_type: 'evaluation' },
      { status: 'confirmed', appointment_type: 'session' },
      { status: 'in_progress', appointment_type: 'session' },
      { status: 'completed', appointment_type: 'session' },
      { status: 'no_show', appointment_type: 'evaluation' },
      { status: 'cancelled', appointment_type: 'session' },
    ]);

    expect(summary.total).toBe(6);
    expect(summary.scheduled).toBe(1);
    expect(summary.confirmed).toBe(1);
    expect(summary.inProgress).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.noShow).toBe(1);
    expect(summary.cancelled).toBe(1);
    expect(summary.evaluations).toBe(2);
    expect(summary.sessions).toBe(4);
  });
});
