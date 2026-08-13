export type WhatsappAction = 'confirm' | 'cancel' | 'reschedule' | 'unknown';

export type ParsedWhatsappCommand = {
  action: WhatsappAction;
  token: string | null;
  rawText: string;
};

const TOKEN_REGEX = /#([a-zA-Z0-9_-]{6,64})/;

export function parseWhatsappCommand(text: string): ParsedWhatsappCommand {
  const rawText = String(text || '');
  const normalized = rawText.toLowerCase().trim();
  const tokenMatch = rawText.match(TOKEN_REGEX);

  const hasConfirm = /\b(confirmar|confirmo|ok)\b/.test(normalized);
  const hasCancel = /\b(cancelar|cancelo|cancelado)\b/.test(normalized);
  const hasReschedule = /\b(remarcar|reagendar|novo horário|novo horario)\b/.test(normalized);

  let action: WhatsappAction = 'unknown';
  if (hasReschedule) action = 'reschedule';
  else if (hasCancel) action = 'cancel';
  else if (hasConfirm) action = 'confirm';

  return {
    action,
    token: tokenMatch ? tokenMatch[1] : null,
    rawText,
  };
}
