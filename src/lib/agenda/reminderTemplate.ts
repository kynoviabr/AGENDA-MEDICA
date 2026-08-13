export function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

export function buildReminderMessage(params: {
  recipientName: string;
  treatmentName: string;
  appointmentDateTimeLabel: string;
  token: string;
}): string {
  return [
    `Olá ${params.recipientName}, seu atendimento (${params.treatmentName}) está marcado para ${params.appointmentDateTimeLabel}.`,
    `Responda: CONFIRMAR #${params.token} ou CANCELAR #${params.token}`,
  ].join(' ');
}
