export type MetricOption = {
  value: string;
  label: string;
  unit: string;
};

const BODY_METRICS: MetricOption[] = [
  { value: 'weight', label: 'Peso', unit: 'kg' },
  { value: 'waist', label: 'Cintura', unit: 'cm' },
  { value: 'hip', label: 'Quadril', unit: 'cm' },
  { value: 'abdomen', label: 'Abdômen', unit: 'cm' },
  { value: 'thigh', label: 'Coxa', unit: 'cm' },
  { value: 'arm', label: 'Braço', unit: 'cm' },
];

const FACIAL_METRICS: MetricOption[] = [
  { value: 'facial_symmetry', label: 'Simetria facial', unit: 'score' },
  { value: 'wrinkle_depth', label: 'Profundidade de linhas', unit: 'score' },
  { value: 'hydration_level', label: 'Hidratação', unit: 'score' },
  { value: 'skin_elasticity', label: 'Elasticidade', unit: 'score' },
];

const DEFAULT_METRICS: MetricOption[] = [
  { value: 'pain_scale', label: 'Escala de desconforto', unit: 'score' },
  { value: 'result_score', label: 'Percepção de resultado', unit: 'score' },
];

export function normalizeCategory(input?: string | null) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function getMetricOptionsForCategory(category?: string | null): MetricOption[] {
  const normalized = normalizeCategory(category);
  if (
    normalized.includes('emagrec') ||
    normalized.includes('corpo') ||
    normalized.includes('laser') ||
    normalized.includes('gordura')
  ) {
    return BODY_METRICS;
  }
  if (
    normalized.includes('face') ||
    normalized.includes('botox') ||
    normalized.includes('facial') ||
    normalized.includes('pele')
  ) {
    return FACIAL_METRICS;
  }
  return DEFAULT_METRICS;
}

export function buildMetricNote(rawNotes: string, treatmentId: string) {
  const note = rawNotes.trim();
  if (!treatmentId) return note;
  return note ? `[TREATMENT:${treatmentId}] ${note}` : `[TREATMENT:${treatmentId}]`;
}

export function extractTreatmentIdFromNotes(notes?: string | null) {
  if (!notes) return null;
  const match = notes.match(/\[TREATMENT:([a-f0-9-]{8,})\]/i);
  return match?.[1] || null;
}

