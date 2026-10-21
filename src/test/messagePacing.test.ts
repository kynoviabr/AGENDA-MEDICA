import { describe, expect, it } from 'vitest';
import { mergePendingPatientTexts, splitReplyIntoBubbles, typingDelayMs } from '@/ai/conversation/messagePacing';

describe('message pacing', () => {
  it('merges unanswered patient texts in order and skips media placeholders', () => {
    expect(mergePendingPatientTexts([
      { body: 'oi', messageType: 'text' },
      { body: '[audio]', messageType: 'audio' },
      { body: ' queria marcar ', messageType: 'text' },
      { body: 'pra minha mãe', messageType: 'text' },
    ])).toBe('oi\nqueria marcar\npra minha mãe');
  });

  it('keeps a single paragraph as one bubble', () => {
    expect(splitReplyIntoBubbles('Oi! Temos horário amanhã às 10h.')).toEqual(['Oi! Temos horário amanhã às 10h.']);
  });

  it('splits paragraphs into at most three bubbles', () => {
    expect(splitReplyIntoBubbles('Oi, Ana!\n\nTemos quinta às 10h.\n\nOu sexta às 14h.\n\nQual prefere?'))
      .toEqual(['Oi, Ana!', 'Temos quinta às 10h.', 'Ou sexta às 14h.\n\nQual prefere?']);
  });

  it('caps the typing pause', () => {
    expect(typingDelayMs('ok')).toBeLessThan(1_000);
    expect(typingDelayMs('x'.repeat(1_000))).toBe(2_500);
  });
});
