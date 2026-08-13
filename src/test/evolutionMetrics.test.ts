import { describe, expect, it } from 'vitest';
import {
  buildMetricNote,
  extractTreatmentIdFromNotes,
  getMetricOptionsForCategory,
} from '@/lib/evolutionMetrics';

describe('evolutionMetrics', () => {
  it('returns body metrics for body categories', () => {
    const options = getMetricOptionsForCategory('Emagrecimento Corporal');
    expect(options.some((metric) => metric.value === 'weight')).toBe(true);
  });

  it('returns facial metrics for facial categories', () => {
    const options = getMetricOptionsForCategory('Botox Facial');
    expect(options.some((metric) => metric.value === 'facial_symmetry')).toBe(true);
  });

  it('builds and extracts treatment marker from note', () => {
    const note = buildMetricNote('anotação', '123e4567-e89b-12d3-a456-426614174000');
    expect(note).toContain('[TREATMENT:123e4567-e89b-12d3-a456-426614174000]');
    expect(extractTreatmentIdFromNotes(note)).toBe('123e4567-e89b-12d3-a456-426614174000');
  });
});

