export function getAgendaErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'Erro desconhecido');
  if (message.includes('AGENDA_SLOT_CONFLICT')) return 'Este horário acabou de ser ocupado. Escolha outro horário.';
  if (message.includes('AGENDA_OUTSIDE_AVAILABILITY')) return 'Horário fora da disponibilidade do profissional.';
  if (message.includes('AGENDA_BLOCKED')) return 'Existe um bloqueio neste período.';
  if (message.includes('AGENDA_TREATMENT_NOT_OFFERED')) return 'O profissional não atende este serviço.';
  if (message.includes('AGENDA_PROFESSIONAL_NOT_AT_LOCATION')) return 'O profissional não atende nesta unidade.';
  return message;
}

