import type { AiExecutionContext } from '../domain/models.ts';
import type {
  AiConversationControl, AiHandoffRecord, AiHandoffRepository, AiHandoffRequest, AiHandoffReason,
} from './domain.ts';

export class InMemoryAiHandoffRepository implements AiHandoffRepository {
  control: AiConversationControl;
  readonly handoffs: AiHandoffRecord[] = [];
  constructor(clinicId = 'clinic-synthetic', conversationId = 'conversation-synthetic') {
    this.control = { clinicId, conversationId, mode: 'ai_active', failureCount: 0, revision: 0 };
  }
  async loadControl() { return structuredClone(this.control); }
  async request(request: AiHandoffRequest) {
    const active = this.handoffs.find((item) => ['requested', 'queued', 'assigned', 'accepted'].includes(item.status));
    if (active) return structuredClone(active);
    const handoff: AiHandoffRecord = {
      id: `handoff-${this.handoffs.length + 1}`, clinicId: request.context.clinicId,
      conversationId: request.context.conversationId, reason: request.reason,
      priority: request.priority, source: request.source, status: 'queued',
      requestedAt: request.requestedAt, summary: request.summary,
    };
    this.handoffs.push(handoff);
    this.control = { ...this.control, mode: 'handoff_pending', activeHandoffId: handoff.id, revision: this.control.revision + 1 };
    return structuredClone(handoff);
  }
  async recordOperationalFailure(context: AiExecutionContext, reason: AiHandoffReason, threshold: number) {
    this.control = { ...this.control, failureCount: this.control.failureCount + 1 };
    if (this.control.failureCount < threshold) return null;
    return this.request({
      context, reason: reason === 'repeated_ambiguity' ? reason : 'repeated_failure', priority: 'normal', source: 'system',
      requestedAt: '2026-08-16T00:00:00.000Z',
      summary: { reason, knownAdministrativeContext: [], whatAuraAlreadyTried: ['Falhas consecutivas.'] },
    });
  }
  async resetOperationalFailures() { this.control = { ...this.control, failureCount: 0 }; }
}
