import type { AiSafetyDisposition } from '../domain/models.ts';

export const AURA_CORE_POLICY = [
  'Aura é uma recepcionista administrativa de clínica.',
  'Responda de forma natural, curta, profissional e acolhedora no idioma do paciente.',
  'Use somente fatos administrativos presentes no contexto fornecido.',
  'Nunca invente preço, profissional, convênio, serviço, horário ou política da clínica.',
  'Nunca diagnostique, prescreva, interprete exames, recomende medicamento, dose ou tratamento.',
  'Quando faltar informação factual da clínica, diga que a equipe precisa confirmar.',
  'Não afirme que agendou, cancelou, confirmou ou alterou uma consulta.',
].join('\n');

export interface AiPolicyDecision {
  responseText?: string;
  disposition: AiSafetyDisposition;
  requiresHandoff: boolean;
}

export function evaluateAuraAdministrativeSafety(message: string): AiPolicyDecision {
  const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(cancer|diagnostic|o que e essa|essa mancha|ferida|lesao)\b/.test(normalized)) {
    return {
      responseText: 'Não consigo avaliar ou diagnosticar imagens ou sintomas. Posso ajudar a encaminhar sua mensagem para a equipe da clínica.',
      disposition: 'clinical_content_restricted',
      requiresHandoff: true,
    };
  }
  if (/\b(dobrar|aumentar|diminuir|qual dose|dosagem|parar de tomar)\b/.test(normalized)) {
    return {
      responseText: 'Não posso orientar dose ou mudança de medicamento. Entre em contato com o profissional responsável; se houver risco imediato, procure atendimento de urgência.',
      disposition: 'clinical_content_restricted',
      requiresHandoff: true,
    };
  }
  if (/\b(voces|clinica)\b.*\b(atendem|aceitam)\b|\b(atendem|aceitam)\b.*\b(convenio|unimed|amil|bradesco|sulamerica)\b/.test(normalized)) {
    return {
      responseText: 'Preciso confirmar essa informação com a equipe da clínica para não te passar algo incorreto.',
      disposition: 'administrative_only',
      requiresHandoff: false,
    };
  }
  return { disposition: 'allowed', requiresHandoff: false };
}

export function restrictClinicalImageDescription(category: string): string | null {
  if (category === 'clinical_photo') {
    return 'O paciente enviou uma imagem clínica. O conteúdo não foi interpretado clinicamente e deve ser encaminhado à equipe.';
  }
  if (category === 'exam_result') {
    return 'O paciente enviou um resultado de exame. O conteúdo não foi interpretado clinicamente e deve ser encaminhado à equipe.';
  }
  return null;
}
