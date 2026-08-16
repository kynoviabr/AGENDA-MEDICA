import type { AiToolName } from '../tools/domain.ts';
import { buildAiGroundingContext, extractNumericClaims } from './grounding.ts';
import type {
  AiResponseSafetyDisposition, AiSafetyValidationInput, AiSafetyValidationResult,
  AiSafetyViolation, AiSafetyViolationCategory,
} from './domain.ts';
import { AI_SAFE_TEMPLATES, templateForViolation } from './templates.ts';

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const RAW_ERROR_PATTERN = /\b(?:23P01|40001|PGRST\w*|SQLSTATE|stack trace|supabase|service_role|postgresql|api[_ -]?key|bearer\s+[\w.-]+|clinic_id|connection_id|patient_id|lead_id|provider[_ -]?token|internal notes?|audit metadata)\b/i;
const INJECTION_PATTERN = /\b(?:ignore (?:todas? )?(?:(?:as|suas) )?(?:regras|instrucoes)|system prompt|prompt do sistema|execute sql|ferramenta escondida|outra clinica|finja que e (?:medic|doutor)|revele (?:as )?instrucoes)\b/i;
const URGENT_PATTERN = /\b(?:dor forte no peito|nao consigo respirar|falta de ar intensa|desmaiei|sangramento intenso|acho que vou morrer)\b/i;

export class AuraAiResponseValidator {
  inspectInput(userText: string) {
    const text = normalize(userText);
    if (URGENT_PATTERN.test(text)) return { category: 'emergency_language' as const, safeResponse: AI_SAFE_TEMPLATES.urgent, requiresHandoff: true };
    if (INJECTION_PATTERN.test(text)) return { category: 'prompt_injection' as const, safeResponse: AI_SAFE_TEMPLATES.injection, requiresHandoff: false };
    return null;
  }

  validate(input: AiSafetyValidationInput): AiSafetyValidationResult {
    const startedAt = performance.now();
    const violations: AiSafetyViolation[] = [];
    const draft = input.draftResponse.trim();
    const grounding = buildAiGroundingContext(input.toolResult, input.message.normalizedText);
    let rewritten = draft;

    if (!draft || draft.length > 1200) add(violations, 'unsupported_claim', 'structural', 'high');
    const preflight = this.inspectInput(input.message.normalizedText);
    if (preflight) add(violations, preflight.category, 'input_policy', preflight.category === 'emergency_language' ? 'critical' : 'high');

    const medical = detectMedicalViolation(draft);
    if (medical) add(violations, medical, 'medical', 'critical');
    const userMedical = detectMedicalViolation(input.message.normalizedText);
    const mixedAdministrative = Boolean(userMedical && isAdministrativeIntent(input.conversation.intent));
    if (mixedAdministrative && !medical) {
      add(violations, userMedical!, 'mixed_medical_administrative', 'high');
      rewritten = `${templateForViolation(userMedical!)} ${draft}`.trim();
    }

    if (UUID_PATTERN.test(draft) || RAW_ERROR_PATTERN.test(draft)) add(violations, 'hidden_data_exposure', 'privacy', 'critical');
    if (containsExcessivePii(draft)) {
      add(violations, 'pii_overexposure', 'privacy', 'high');
      rewritten = redactPii(rewritten);
    }
    if (grounding.sources.some((source) => source.clinicId && source.clinicId !== input.context.clinicId)) {
      add(violations, 'tenant_data_leak', 'tenant', 'critical');
    }
    if (grounding.sources.some((source) => !source.patientVisible
      || (source.sourceType === 'curated_knowledge' && (!source.verifiedAt || !source.published)))) {
      add(violations, 'unsupported_clinic_fact', 'knowledge_source', 'critical');
    }
    if (grounding.knowledgeFacts.some((fact) => INJECTION_PATTERN.test(normalize(fact)))) {
      add(violations, 'unsafe_knowledge_instruction', 'knowledge_instruction', 'critical');
    }

    validateAction(input, violations);
    validateUnknownKnowledge(input, violations);
    validateNumericClaims(input, grounding.numericFacts, violations);
    validateEntityClaims(input, violations);

    const disposition = chooseDisposition(violations, input);
    const safeResponse = finalResponse(disposition, violations, rewritten, preflight?.safeResponse);
    return {
      disposition, violations, grounded: !violations.some((item) => GROUNDING_VIOLATIONS.has(item.category)),
      requiresClarification: disposition === 'require_clarification',
      requiresHandoff: disposition === 'require_handoff', safeResponse,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  }
}

const GROUNDING_VIOLATIONS = new Set<AiSafetyViolationCategory>([
  'unsupported_clinic_fact', 'unsupported_tool_fact', 'unsupported_numeric_fact', 'tenant_data_leak',
  'unsafe_knowledge_instruction', 'unconfirmed_mutation', 'external_source_write_violation', 'unsupported_claim',
]);

function validateAction(input: AiSafetyValidationInput, violations: AiSafetyViolation[]) {
  const successClaim = claimedMutation(input.draftResponse);
  if (input.toolResult?.outcome === 'clarification_required') add(violations, 'ambiguous_action', 'action', 'high');
  if (!successClaim) return;
  const tool = input.toolResult;
  if (!tool || tool.kind !== 'mutation' || tool.outcome !== 'success' || !mutationMatches(successClaim, tool.toolName)) {
    add(violations, 'unconfirmed_mutation', 'action', 'critical'); return;
  }
  const serialized = JSON.stringify(tool.data || {});
  if (/"(?:provider|sourceOfTruth)":"external/i.test(serialized) && !/"writeCapability":true/i.test(serialized)) {
    add(violations, 'external_source_write_violation', 'action', 'critical');
  }
}

function validateUnknownKnowledge(input: AiSafetyValidationInput, violations: AiSafetyViolation[]) {
  if (input.toolResult?.toolName !== 'search_administrative_knowledge') return;
  const data = input.toolResult.data as { knowledgeOutcome?: string } | undefined;
  if (data?.knowledgeOutcome === 'answered') return;
  const text = normalize(input.draftResponse);
  if (/\b(?:tem|possui|oferece|nao tem|nao possui|funciona|aceita|atende)\b/.test(text)
    && !/nao tenho (?:essa )?informacao confirmada/.test(text)) {
    add(violations, 'unsupported_clinic_fact', 'unknown_knowledge', 'high');
  }
}

function validateNumericClaims(input: AiSafetyValidationInput, allowed: readonly string[], violations: AiSafetyViolation[]) {
  const draftClaims = extractNumericClaims(input.draftResponse);
  if (!draftClaims.length) return;
  const userClaims = extractNumericClaims(input.message.normalizedText).filter((item) => !item.startsWith('r$'));
  const supported = new Set([...allowed, ...userClaims]);
  if (draftClaims.some((claim) => ![...supported].some((item) => numericEquivalent(claim, item)))) {
    add(violations, 'unsupported_numeric_fact', 'numeric_grounding', 'high');
  }
}

function validateEntityClaims(input: AiSafetyValidationInput, violations: AiSafetyViolation[]) {
  const draft = normalize(input.draftResponse);
  const serialized = normalize(JSON.stringify(input.toolResult?.data || {}));
  if (/\b(?:aceita|atende)\s+(?:o\s+)?(?:convenio\s+)?([a-z][\w -]{2,30})/.test(draft)
    && (!serialized || /"acceptsnewpatients":false/.test(serialized))) {
    add(violations, 'unsupported_tool_fact', 'insurance_grounding', 'high');
  }
  const professionals = [...input.draftResponse.matchAll(/\bDr(?:a)?\.?\s+([A-ZÀ-Ý][\p{L}'-]+(?:\s+[A-ZÀ-Ý][\p{L}'-]+){0,3})/gu)];
  if (professionals.some((match) => !serialized.includes(normalize(match[0])))) add(violations, 'unsupported_tool_fact', 'professional_grounding', 'high');
  const serviceClaim = draft.match(/\b(?:realiza|oferece|faz)\s+(?:o\s+)?(?:servico\s+)?([a-z][\w -]{2,40})/);
  if (serviceClaim?.[1] && !serialized.includes(serviceClaim[1].trim())) add(violations, 'unsupported_tool_fact', 'service_grounding', 'high');
}

function chooseDisposition(violations: readonly AiSafetyViolation[], input: AiSafetyValidationInput): AiResponseSafetyDisposition {
  if (!violations.length) return 'allow';
  if (violations.some((item) => item.category === 'emergency_language')) return 'require_handoff';
  if (violations.some((item) => item.category === 'ambiguous_action')) return 'require_clarification';
  if (violations.some((item) => ['tenant_data_leak', 'hidden_data_exposure', 'unsafe_knowledge_instruction', 'unconfirmed_mutation', 'external_source_write_violation'].includes(item.category))) return 'block';
  if (input.conversation.requiresHandoff) return 'require_handoff';
  return 'rewrite_safe';
}

function finalResponse(disposition: AiResponseSafetyDisposition, violations: readonly AiSafetyViolation[], rewritten: string, preflight?: string) {
  if (disposition === 'allow') return rewritten;
  if (preflight) return preflight;
  if (disposition === 'require_handoff') {
    const medical = violations.find((item) => item.category.startsWith('medical_') || item.category === 'treatment_recommendation');
    return medical ? `${templateForViolation(medical.category)} ${AI_SAFE_TEMPLATES.handoff}` : AI_SAFE_TEMPLATES.handoff;
  }
  if (disposition === 'require_clarification') return AI_SAFE_TEMPLATES.ambiguity;
  const first = violations[0];
  if (first?.validator === 'mixed_medical_administrative') return rewritten;
  if (first?.category === 'pii_overexposure' && violations.length === 1) return rewritten;
  return first ? templateForViolation(first.category) : AI_SAFE_TEMPLATES.technical;
}

function detectMedicalViolation(value: string): AiSafetyViolationCategory | null {
  const text = normalize(value);
  if (/\b(?:dobre|aumente|reduza|diminua|pare|tome)\s+(?:a\s+)?dose\b|\b\d+\s*(?:mg|ml)\b/.test(text)) return 'medical_dose_advice';
  if (/\b(?:voce pode tomar|recomendo tomar|tome o medicamento|use o remedio|prescrevo)\b/.test(text)) return 'medical_prescription';
  if (/\b(?:resultado|exame|glicose|imagem)\b.{0,40}\b(?:indica|significa|mostra|confirma)\b/.test(text)) return 'medical_exam_interpretation';
  if (/\b(?:isso|essa mancha|essa pinta|seu sintoma)\b.{0,30}\b(?:parece|e|indica)\b.{0,20}\b(?:cancer|dermatite|diabetes|infeccao|doenca)\b/.test(text)) return 'medical_diagnosis';
  if (/\b(?:recomendo|deve fazer|melhor tratamento|tratamento indicado|prognostico)\b/.test(text)) return 'treatment_recommendation';
  return null;
}

function claimedMutation(value: string): 'create' | 'confirm' | 'cancel' | 'reschedule' | null {
  const text = normalize(value);
  if (/\b(?:pronto[, ]*)?(?:agendei|marquei|consulta agendada|agendamento realizado)\b/.test(text)) return 'create';
  if (/\b(?:consulta confirmada|confirmei)\b/.test(text)) return 'confirm';
  if (/\b(?:consulta cancelada|cancelei|cancelamento realizado)\b/.test(text)) return 'cancel';
  if (/\b(?:consulta reagendada|reagendei|reagendamento realizado)\b/.test(text)) return 'reschedule';
  return null;
}

function mutationMatches(claim: NonNullable<ReturnType<typeof claimedMutation>>, tool: AiToolName) {
  return ({ create: 'create_appointment', confirm: 'confirm_appointment', cancel: 'cancel_appointment', reschedule: 'reschedule_appointment' } as const)[claim] === tool;
}

function containsExcessivePii(value: string) {
  return /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(value) || /\b(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[- ]?\d{4}\b/.test(value);
}
function redactPii(value: string) {
  return value.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '***.***.***-**')
    .replace(/\b(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[- ]?\d{4}\b/g, 'telefone protegido');
}
function numericEquivalent(left: string, right: string) {
  const strip = (value: string) => value.replace(/(?:r\$|minutos?|horas?|dias?|h)/g, '').replace(/:00$/, '');
  return left === right || strip(left) === strip(right);
}
function isAdministrativeIntent(intent: string) { return intent !== 'medical_restricted' && intent !== 'unknown'; }
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim(); }
function add(items: AiSafetyViolation[], category: AiSafetyViolationCategory, validator: string, severity: AiSafetyViolation['severity']) {
  if (!items.some((item) => item.category === category && item.validator === validator)) items.push({ category, validator, severity });
}
