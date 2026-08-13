export type DailyAppointment = {
  status: string | null;
  start_time?: string | null;
  appointment_type?: string | null;
};

export type DailyAgendaSummary = {
  total: number;
  scheduled: number;
  confirmed: number;
  inProgress: number;
  completed: number;
  noShow: number;
  cancelled: number;
  evaluations: number;
  sessions: number;
};

export function buildDailyAgendaSummary(appointments: DailyAppointment[]): DailyAgendaSummary {
  const summary: DailyAgendaSummary = {
    total: 0,
    scheduled: 0,
    confirmed: 0,
    inProgress: 0,
    completed: 0,
    noShow: 0,
    cancelled: 0,
    evaluations: 0,
    sessions: 0,
  };

  for (const appointment of appointments) {
    summary.total += 1;
    const status = String(appointment.status || '').toLowerCase();
    const type = String(appointment.appointment_type || '').toLowerCase();

    if (status === 'scheduled') summary.scheduled += 1;
    else if (status === 'confirmed') summary.confirmed += 1;
    else if (status === 'in_progress') summary.inProgress += 1;
    else if (status === 'completed') summary.completed += 1;
    else if (status === 'no_show') summary.noShow += 1;
    else if (status === 'cancelled') summary.cancelled += 1;

    if (type === 'evaluation') summary.evaluations += 1;
    else summary.sessions += 1;
  }

  return summary;
}
