import type {
  AiBillingType,
  AiConversationConfidence,
  AiConversationEntities,
  AiConversationIntent,
  AiConversationInterpretation,
  AiConversationInterpreter,
  AiConversationInterpreterRequest,
  AiConversationStateField,
  AiEvidenceSource,
  AiStatePatchOperation,
  AiTemporalExpression,
} from '../../domain/conversation.ts';
import type { AiSafetyDisposition } from '../../domain/models.ts';
import { AiConversationInterpretationError } from '../../errors/AiError.ts';
import { extractOpenAiOutputText, OpenAiHttpClient, type OpenAiProviderOptions } from './openAiHttp.ts';

export const AI_CONVERSATION_INTENTS: readonly AiConversationIntent[] = [
  'greeting', 'administrative_question', 'scheduling_request', 'reschedule_request', 'cancellation_request',
  'confirmation_request', 'waitlist_request', 'professional_question', 'service_question', 'insurance_question',
  'price_question', 'location_question', 'human_handoff', 'medical_restricted', 'unknown',
];

type RawOperation = {
  field: AiConversationStateField;
  operation: 'set' | 'clear';
  value: string | null;
  evidence_source: AiEvidenceSource;
  requires_confirmation: boolean;
  temporal_kind: AiTemporalExpression['kind'] | null;
  resolved_date: string | null;
  range_start: string | null;
  range_end: string | null;
  weekday: number | null;
  time_preference: AiTemporalExpression['timePreference'] | null;
  after_time: string | null;
  before_time: string | null;
};

type RawInterpretation = {
  schema_version: 1;
  intent: AiConversationIntent;
  confidence: AiConversationConfidence;
  operations: RawOperation[];
  excluded_professionals: string[];
  excluded_insurances: string[];
  excluded_time_preferences: string[];
  ambiguity: { field: AiConversationStateField | 'reference'; candidates: string[]; reason: string } | null;
  reference_expression: string | null;
  is_correction: boolean;
  is_small_talk: boolean;
  ends_current_task: boolean;
  requires_handoff: boolean;
  safety_disposition: AiSafetyDisposition;
  response_text: string;
};

const nullableString = { type: ['string', 'null'] };

export class OpenAiConversationInterpreter implements AiConversationInterpreter {
  readonly name = 'openai';
  private readonly http: OpenAiHttpClient;

  constructor(options: OpenAiProviderOptions, private readonly model: string) {
    this.http = new OpenAiHttpClient(options);
  }

  async interpret(request: AiConversationInterpreterRequest): Promise<AiConversationInterpretation> {
    const startedAt = performance.now();
    const response = await this.http.fetch(`${this.http.baseUrl}/responses`, {
      method: 'POST', headers: this.http.headers(), signal: request.signal,
      body: JSON.stringify({
        model: this.model,
        store: false,
        max_output_tokens: 900,
        instructions: [
          'Você interpreta um turno de atendimento administrativo de clínica. Retorne apenas o schema solicitado.',
          'Produza somente patch: nunca copie nem substitua o state inteiro. Não invente fatos, disponibilidade ou ações concluídas.',
          'Correções substituem somente o campo citado. Negação nunca seleciona a entidade negada; use listas excluded.',
          'Se o dado veio de imagem/documento, marque requires_confirmation=true.',
          'Saudações e agradecimentos não apagam estado. Uma resposta deve ser curta e conter no máximo uma pergunta.',
          'Intent não autoriza executar ferramenta, consultar agenda ou alterar consulta.',
          `Timezone explícito: ${request.timezone}. Momento do turno: ${request.now}.`,
          `Idioma: ${request.preferredLanguage}. Estilo: ${request.responseStyle}.`,
          request.clinicContext,
        ].join('\n'),
        input: [
          { role: 'developer', content: `STATE_JSON=${JSON.stringify(request.state)}` },
          ...request.history.map((item) => ({ role: item.role, content: item.text })),
          { role: 'user', content: request.message.normalizedText },
        ],
        text: { format: {
          type: 'json_schema', name: 'aura_conversation_turn_v1', strict: true,
          schema: {
            type: 'object', additionalProperties: false,
            properties: {
              schema_version: { type: 'integer', enum: [1] },
              intent: { type: 'string', enum: AI_CONVERSATION_INTENTS },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              operations: { type: 'array', maxItems: 12, items: {
                type: 'object', additionalProperties: false,
                properties: {
                  field: { type: 'string', enum: ['professional', 'service', 'insurance', 'insuranceCandidate', 'billingType', 'date', 'location', 'appointmentReference', 'selectedOption'] },
                  operation: { type: 'string', enum: ['set', 'clear'] },
                  value: nullableString,
                  evidence_source: { type: 'string', enum: ['user_text', 'transcription', 'image_extraction', 'document_extraction', 'clinic_context'] },
                  requires_confirmation: { type: 'boolean' },
                  temporal_kind: { type: ['string', 'null'], enum: ['exact_date', 'relative_date', 'weekday', 'date_range', 'time_only', null] },
                  resolved_date: nullableString, range_start: nullableString, range_end: nullableString,
                  weekday: { type: ['integer', 'null'], minimum: 0, maximum: 6 },
                  time_preference: { type: ['string', 'null'], enum: ['morning', 'afternoon', 'evening', 'any', null] },
                  after_time: nullableString, before_time: nullableString,
                },
                required: ['field', 'operation', 'value', 'evidence_source', 'requires_confirmation', 'temporal_kind', 'resolved_date', 'range_start', 'range_end', 'weekday', 'time_preference', 'after_time', 'before_time'],
              } },
              excluded_professionals: { type: 'array', items: { type: 'string' }, maxItems: 10 },
              excluded_insurances: { type: 'array', items: { type: 'string' }, maxItems: 10 },
              excluded_time_preferences: { type: 'array', items: { type: 'string' }, maxItems: 10 },
              ambiguity: { type: ['object', 'null'], additionalProperties: false, properties: {
                field: { type: 'string', enum: ['professional', 'service', 'insurance', 'insuranceCandidate', 'billingType', 'date', 'location', 'appointmentReference', 'selectedOption', 'reference'] },
                candidates: { type: 'array', items: { type: 'string' }, maxItems: 10 }, reason: { type: 'string' },
              }, required: ['field', 'candidates', 'reason'] },
              reference_expression: nullableString,
              is_correction: { type: 'boolean' }, is_small_talk: { type: 'boolean' }, ends_current_task: { type: 'boolean' },
              requires_handoff: { type: 'boolean' },
              safety_disposition: { type: 'string', enum: ['allowed', 'administrative_only', 'clinical_content_restricted', 'requires_handoff'] },
              response_text: { type: 'string' },
            },
            required: ['schema_version', 'intent', 'confidence', 'operations', 'excluded_professionals', 'excluded_insurances', 'excluded_time_preferences', 'ambiguity', 'reference_expression', 'is_correction', 'is_small_talk', 'ends_current_task', 'requires_handoff', 'safety_disposition', 'response_text'],
          },
        } },
      }),
    });
    await this.http.assertOk(response);
    const payload = await response.json() as Record<string, unknown>;
    let raw: RawInterpretation;
    try { raw = JSON.parse(extractOpenAiOutputText(payload)) as RawInterpretation; }
    catch (error) { throw new AiConversationInterpretationError(error); }
    try {
      if (raw.schema_version !== 1 || !AI_CONVERSATION_INTENTS.includes(raw.intent) || !Array.isArray(raw.operations)) throw new Error('invalid schema');
      const usage = (payload.usage || {}) as Record<string, number | undefined>;
      return {
        schemaVersion: 1, intent: raw.intent, confidence: raw.confidence,
        statePatch: {
          operations: raw.operations.map((operation) => this.toOperation(operation, request.timezone)),
          addExcludedProfessionals: raw.excluded_professionals,
          addExcludedInsurances: raw.excluded_insurances,
          addExcludedTimePreferences: raw.excluded_time_preferences,
        },
        ambiguity: raw.ambiguity || undefined,
        referenceExpression: raw.reference_expression || undefined,
        isCorrection: raw.is_correction, isSmallTalk: raw.is_small_talk, endsCurrentTask: raw.ends_current_task,
        requiresHandoff: raw.requires_handoff, safetyDisposition: raw.safety_disposition,
        responseText: raw.response_text.trim(), provider: this.name,
        model: String(payload.model || this.model),
        usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens },
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    } catch (error) { throw new AiConversationInterpretationError(error); }
  }

  private toOperation(operation: RawOperation, timezone: string): AiStatePatchOperation {
    if (operation.operation === 'clear') return { field: operation.field, operation: 'clear' };
    if (!operation.value) throw new Error('set operation without value');
    let value: AiConversationEntities[AiConversationStateField] = {
      value: operation.value, source: operation.evidence_source, confidence: 'high',
      requiresConfirmation: operation.requires_confirmation,
    };
    if (operation.field === 'billingType') {
      if (operation.value !== 'private' && operation.value !== 'insurance') throw new Error('invalid billing type');
      value = { ...value, value: operation.value as AiBillingType };
    }
    if (operation.field === 'date') {
      value = { ...value, value: {
        raw: operation.value, kind: operation.temporal_kind || 'relative_date', timezone,
        resolvedDate: operation.resolved_date || undefined, rangeStart: operation.range_start || undefined,
        rangeEnd: operation.range_end || undefined, weekday: operation.weekday ?? undefined,
        timePreference: operation.time_preference || undefined, afterTime: operation.after_time || undefined,
        beforeTime: operation.before_time || undefined,
      } };
    }
    return { field: operation.field, operation: 'set', value };
  }
}
