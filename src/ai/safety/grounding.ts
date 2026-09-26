import type { AiToolResult } from '../tools/domain.ts';
import type { AiGroundingContext, AiGroundingSource } from './domain.ts';

const KNOWLEDGE_TABLES = new Set([
  'clinics', 'clinic_locations', 'professionals', 'treatments', 'health_insurances',
  'clinic_administrative_policies', 'administrative_knowledge_entries',
]);

export function buildAiGroundingContext(toolResult: AiToolResult | undefined, userText: string): AiGroundingContext {
  const toolFacts: string[] = [];
  const knowledgeFacts: string[] = [];
  const sources: AiGroundingSource[] = [];
  if (toolResult) {
    collectLeaves(toolResult.data, toolFacts);
    for (const option of toolResult.presentedOptions || []) toolFacts.push(option.label, option.value);
    if (toolResult.message) toolFacts.push(toolResult.message);
    collectKnowledge(toolResult.data, knowledgeFacts, sources);
  }
  const allowedFacts = unique([...toolFacts, ...knowledgeFacts]);
  return {
    toolFacts: unique(toolFacts), knowledgeFacts: unique(knowledgeFacts),
    numericFacts: unique(allowedFacts.flatMap(extractNumericClaims)),
    userProvidedFacts: [userText], allowedFacts,
    sources,
  };
}

function collectLeaves(value: unknown, output: string[]) {
  if (typeof value === 'string' || typeof value === 'number') { output.push(String(value)); return; }
  if (Array.isArray(value)) { value.forEach((item) => collectLeaves(item, output)); return; }
  if (!value || typeof value !== 'object') return;
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (!['id', 'recordId', 'clinicId', 'patientId', 'leadId'].includes(key)) collectLeaves(item, output);
  });
}

function collectKnowledge(value: unknown, facts: string[], sources: AiGroundingSource[]) {
  if (Array.isArray(value)) { value.forEach((item) => collectKnowledge(item, facts, sources)); return; }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string' && record.source && typeof record.source === 'object') {
    const source = record.source as Record<string, unknown>;
    const table = typeof source.table === 'string' ? source.table : undefined;
    facts.push(record.text);
    sources.push({
      sourceType: source.sourceType === 'curated' ? 'curated_knowledge' : 'structured_knowledge',
      clinicId: typeof source.clinicId === 'string' ? source.clinicId : undefined,
      table, field: typeof source.field === 'string' ? source.field : undefined,
      verifiedAt: typeof source.verifiedAt === 'string' ? source.verifiedAt : undefined,
      published: source.published === true,
      patientVisible: source.patientVisible !== false && Boolean(table && KNOWLEDGE_TABLES.has(table)),
    });
  }
  Object.values(record).forEach((item) => collectKnowledge(item, facts, sources));
}

export function extractNumericClaims(value: string) {
  const matches = value.match(/(?:R\$\s*)?\d{1,4}(?:[.,:]\d{1,2})?(?:\s*(?:h|minutos?|horas?|dias?))?/gi) || [];
  return matches.map(normalizeNumericClaim);
}

export function normalizeNumericClaim(value: string) {
  return value.toLocaleLowerCase('pt-BR').replace(/\s+/g, '').replace(',', '.').replace(/^0+(?=\d)/, '');
}

function unique(items: readonly string[]) { return [...new Set(items.map((item) => item.trim()).filter(Boolean))]; }
