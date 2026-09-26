import type { AiConversationState } from '../domain/conversation.ts';

export interface AiResolvedReference { expression: string; optionId: string; label: string; value: string }

export function resolvePresentedOptionReference(expression: string, state: AiConversationState): AiResolvedReference | null {
  const value = expression.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const options = state.lastPresentedOptions;
  if (!options.length) return null;
  let index: number | null = null;
  if (/\b(primeir[oa]|1[ºª]?)\b/.test(value)) index = 0;
  else if (/\b(segund[oa]|2[ºª]?)\b/.test(value)) index = 1;
  else if (/\b(terceir[oa]|3[ºª]?)\b/.test(value)) index = 2;
  else if (/\b(ultim[oa])\b/.test(value)) index = options.length - 1;
  else if (/\b(esse|esse mesmo|isso|pode ser)\b/.test(value) && options.length === 1) index = 0;
  if (index === null || !options[index]) return null;
  const option = options[index];
  return { expression, optionId: option.id, label: option.label, value: option.value };
}
