// Pacing helpers that make WhatsApp replies feel like a person typing:
// several short patient messages get one answer, and long answers go out
// as a few short bubbles.

export const DEFAULT_REPLY_QUIET_PERIOD_MS = 6_000;
export const MAX_REPLY_BUBBLES = 3;

export interface PendingPatientMessage {
  body: string;
  messageType: string;
}

// Joins the patient's unanswered text messages, oldest first, into one turn.
export function mergePendingPatientTexts(pending: readonly PendingPatientMessage[]): string {
  return pending
    .filter((message) => message.messageType === 'text')
    .map((message) => message.body.trim())
    .filter(Boolean)
    .join('\n');
}

// Splits a reply on blank lines into at most MAX_REPLY_BUBBLES messages;
// anything beyond the limit stays in the last bubble.
export function splitReplyIntoBubbles(text: string, maxBubbles = MAX_REPLY_BUBBLES): string[] {
  const parts = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return [text.trim()].filter(Boolean);
  const head = parts.slice(0, maxBubbles - 1);
  const tail = parts.slice(maxBubbles - 1).join('\n\n');
  return [...head, tail].filter(Boolean);
}

// Short pause between bubbles, proportional to the next bubble's length.
export function typingDelayMs(nextBubble: string) {
  return Math.min(2_500, 600 + nextBubble.length * 15);
}
