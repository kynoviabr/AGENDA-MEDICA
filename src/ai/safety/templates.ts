import type { AiSafetyViolationCategory } from './domain.ts';

export const AI_SAFE_TEMPLATES = {
  diagnosis: 'Não consigo avaliar ou diagnosticar sintomas. Posso ajudar com informações administrativas ou com o agendamento.',
  prescription: 'Não posso indicar medicamentos ou prescrever tratamentos. Posso encaminhar sua mensagem para a equipe da clínica.',
  dose: 'Não posso orientar dose ou mudança de medicamento. Entre em contato com o profissional responsável.',
  exam: 'Não posso interpretar resultados de exames ou imagens clínicas. Posso ajudar com o agendamento ou encaminhar para a equipe.',
  treatment: 'Não posso recomendar tratamento ou tomar uma decisão clínica. Posso ajudar com informações administrativas.',
  urgent: 'Não consigo avaliar urgência médica. Se você estiver em risco imediato, procure agora um serviço de emergência ou ligue 192. Também vou sinalizar sua mensagem para a equipe da clínica.',
  unknownFact: 'Não tenho essa informação confirmada aqui. Posso encaminhar sua dúvida para a equipe da clínica.',
  ambiguity: 'Encontrei mais de uma opção e preciso que você confirme qual delas deseja.',
  unavailable: 'Esta operação não está disponível com segurança por aqui. Posso encaminhar sua solicitação para a equipe da clínica.',
  technical: 'Não consegui confirmar essa informação com segurança agora. Posso encaminhar sua dúvida para a equipe da clínica.',
  handoff: 'Vou encaminhar sua mensagem para uma pessoa da equipe da clínica.',
  injection: 'Posso ajudar apenas com informações administrativas e agendamentos da clínica.',
} as const;

export function templateForViolation(category: AiSafetyViolationCategory) {
  if (category === 'medical_diagnosis') return AI_SAFE_TEMPLATES.diagnosis;
  if (category === 'medical_prescription') return AI_SAFE_TEMPLATES.prescription;
  if (category === 'medical_dose_advice') return AI_SAFE_TEMPLATES.dose;
  if (category === 'medical_exam_interpretation') return AI_SAFE_TEMPLATES.exam;
  if (category === 'treatment_recommendation') return AI_SAFE_TEMPLATES.treatment;
  if (category === 'emergency_language') return AI_SAFE_TEMPLATES.urgent;
  if (category === 'ambiguous_action') return AI_SAFE_TEMPLATES.ambiguity;
  if (category === 'prompt_injection') return AI_SAFE_TEMPLATES.injection;
  if (category === 'external_source_write_violation' || category === 'unconfirmed_mutation') return AI_SAFE_TEMPLATES.unavailable;
  if (category === 'unsupported_clinic_fact' || category === 'unsupported_tool_fact' || category === 'unsupported_numeric_fact' || category === 'unsupported_claim' || category === 'unsafe_knowledge_instruction') return AI_SAFE_TEMPLATES.unknownFact;
  return AI_SAFE_TEMPLATES.technical;
}
