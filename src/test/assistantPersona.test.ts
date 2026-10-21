import { describe, expect, it } from 'vitest';
import { buildAssistantPersona, resolveAssistantName } from '@/ai/policies/assistantPersona';

const base = { clinicName: 'Clínica Sintética', responseStyle: 'curta e acolhedora', preferredLanguage: 'pt-BR' };

describe('assistant persona', () => {
  it('uses the clinic-chosen name and falls back to Aura', () => {
    expect(resolveAssistantName('  Bia ')).toBe('Bia');
    expect(resolveAssistantName('')).toBe('Aura');
    expect(resolveAssistantName(null)).toBe('Aura');
    expect(buildAssistantPersona({ ...base, assistantName: 'Bia' })).toContain('Você é Bia, assistente virtual de atendimento da Clínica Sintética');
  });

  it('discloses being an AI and never pretends to be human', () => {
    const persona = buildAssistantPersona({ ...base, assistantName: 'Bia' });
    expect(persona).toContain('assistente virtual com inteligência artificial');
    expect(persona).toContain('Nunca finja ser humana');
  });

  it('includes the clinic personality only when set', () => {
    expect(buildAssistantPersona({ ...base, assistantPersonality: 'usa emoji com moderação' })).toContain('Jeito de falar definido pela clínica: usa emoji com moderação');
    expect(buildAssistantPersona(base)).not.toContain('Jeito de falar');
  });
});
