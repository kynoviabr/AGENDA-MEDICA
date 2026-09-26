import type { AdministrativeKnowledgeAnswer, AdministrativeKnowledgeSource } from '../../knowledge/domain/models.ts';
import type { AdministrativeKnowledgeService } from '../../knowledge/services/AdministrativeKnowledgeService.ts';
import type { AiToolAuditRecorder, AiToolExecutionRequest, AiToolExecutor, AiToolResult } from './domain.ts';
import { NoopAiToolAuditRecorder } from './domain.ts';
import { AiToolError } from './errors.ts';
import { AiToolRegistry } from './registry.ts';

export interface AiKnowledgeAuditEvent {
  context: AiToolExecutionRequest['context'];
  topic: AdministrativeKnowledgeAnswer['topic'];
  outcome: AdministrativeKnowledgeAnswer['outcome'];
  sources: readonly AdministrativeKnowledgeSource[];
  latencyMs: number;
  occurredAt: string;
}

export interface AiKnowledgeAuditRecorder { record(event: AiKnowledgeAuditEvent): Promise<void> }
export class NoopAiKnowledgeAuditRecorder implements AiKnowledgeAuditRecorder { async record(): Promise<void> {} }

export class AdministrativeKnowledgeToolExecutor implements AiToolExecutor {
  constructor(
    private readonly knowledge: AdministrativeKnowledgeService,
    private readonly registry = new AiToolRegistry(),
    private readonly toolAudit: AiToolAuditRecorder = new NoopAiToolAuditRecorder(),
    private readonly knowledgeAudit: AiKnowledgeAuditRecorder = new NoopAiKnowledgeAuditRecorder(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(request: AiToolExecutionRequest): Promise<AiToolResult> {
    const startedAt = performance.now();
    let result: AiToolResult;
    let answer: AdministrativeKnowledgeAnswer | undefined;
    try {
      const definition = this.registry.validate(request.tool);
      if (definition.name !== 'search_administrative_knowledge' || definition.kind !== 'read') {
        throw new AiToolError('AI_TOOL_NOT_REGISTERED', 'Knowledge executor only accepts its registered read tool.');
      }
      if (!request.config.readEnabled) throw new AiToolError('AI_TOOL_READ_DISABLED', 'Read tools are disabled.');
      if (!request.config.knowledgeEnabled) throw new AiToolError('AI_TOOL_KNOWLEDGE_DISABLED', 'Knowledge Engine is disabled.');
      if (!request.config.knowledgeValidatedAt) throw new AiToolError('AI_TOOL_KNOWLEDGE_NOT_VALIDATED', 'Knowledge Engine is not validated.');
      const args = request.tool.arguments;
      answer = await this.knowledge.search({ clinicId: request.context.clinicId }, {
        query: requiredText(args, 'query'), locationName: optionalText(args, 'locationName'),
        professionalName: optionalText(args, 'professionalName'), serviceName: optionalText(args, 'serviceName'),
        insuranceName: optionalText(args, 'insuranceName'),
      });
      result = {
        schemaVersion: 1, toolName: request.tool.name, kind: 'read', outcome: 'success',
        data: {
          topic: answer.topic, knowledgeOutcome: answer.outcome,
          facts: answer.facts.map((item) => ({
            text: item.text,
            source: {
              ...item.source, clinicId: request.context.clinicId, patientVisible: true,
              published: item.source.sourceType === 'curated' ? true : undefined,
            },
          })),
          safeMessage: answer.safeMessage,
        },
        message: answer.safeMessage,
      };
    } catch (error) {
      const normalized = error instanceof AiToolError
        ? error : new AiToolError('AI_TOOL_EXECUTION_FAILED', 'Knowledge query failed.', error);
      result = {
        schemaVersion: 1, toolName: request.tool.name, kind: request.tool.kind,
        outcome: normalized.code === 'AI_TOOL_EXECUTION_FAILED' ? 'error' : 'denied',
        errorCode: normalized.code,
        message: normalized.code.includes('DISABLED') || normalized.code.includes('NOT_VALIDATED')
          ? 'Esta consulta administrativa ainda não está habilitada para a clínica.'
          : 'Não tenho essa informação confirmada aqui. Posso encaminhar sua dúvida para a equipe da clínica.',
      };
    }
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    await Promise.allSettled([
      this.toolAudit.record({ context: request.context, toolName: request.tool.name, kind: request.tool.kind, outcome: result.outcome, errorCode: result.errorCode, latencyMs, occurredAt: this.now().toISOString() }),
      answer ? this.knowledgeAudit.record({ context: request.context, topic: answer.topic, outcome: answer.outcome, sources: answer.facts.map((item) => item.source), latencyMs, occurredAt: this.now().toISOString() }) : Promise.resolve(),
    ]);
    return result;
  }
}

function optionalText(args: Readonly<Record<string, unknown>>, name: string) {
  const value = args[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function requiredText(args: Readonly<Record<string, unknown>>, name: string) {
  const value = optionalText(args, name);
  if (!value) throw new AiToolError('AI_TOOL_INVALID_REQUEST', `${name} is required.`);
  return value;
}
