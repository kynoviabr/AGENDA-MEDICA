export function getAgendaErrorMessage(error: unknown): string {
  const payload = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  const message = error instanceof Error
    ? error.message
    : [payload?.message, payload?.details, payload?.hint, payload?.code]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' · ') || String(error || 'Erro desconhecido');
  if (message.includes('AGENDA_SLOT_CONFLICT')) return 'Este horário acabou de ser ocupado. Escolha outro horário.';
  if (message.includes('AGENDA_OUTSIDE_OPERATING_HOURS')) return 'A unidade ou o profissional não atende neste horário.';
  if (message.includes('AGENDA_OUTSIDE_AVAILABILITY')) return 'Horário fora da disponibilidade do profissional.';
  if (message.includes('AGENDA_BLOCKED')) return 'Existe um bloqueio neste período.';
  if (message.includes('AGENDA_TREATMENT_NOT_OFFERED')) return 'O profissional não atende este serviço.';
  if (message.includes('AGENDA_PROFESSIONAL_NOT_AT_LOCATION')) return 'O profissional não atende nesta unidade.';
  return message;
}
