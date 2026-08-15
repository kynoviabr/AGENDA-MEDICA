import type {
  AiConversationIntent,
  AiConversationState,
  AiPresentedOption,
} from '../domain/conversation.ts';
import type { AiExecutionContext, AiUsage } from '../domain/models.ts';

export type AiToolKind = 'read' | 'mutation';

export type AiReadToolName =
  | 'list_locations'
  | 'list_professionals'
  | 'list_services'
  | 'list_insurances'
  | 'get_available_slots'
  | 'find_patient_appointments';

export type AiMutationToolName =
  | 'create_appointment'
  | 'confirm_appointment'
  | 'cancel_appointment'
  | 'reschedule_appointment';

export type AiToolName = AiReadToolName | AiMutationToolName;

export interface AiToolRequest {
  schemaVersion: 1;
  name: AiToolName;
  kind: AiToolKind;
  intent: AiConversationIntent;
  arguments: Readonly<Record<string, unknown>>;
}

export interface AiToolExecutionConfig {
  engineMode?: 'legacy' | 'shadow' | 'active';
  readEnabled: boolean;
  readValidatedAt?: string;
  mutationsEnabled: boolean;
}

export interface AiToolPlanningRequest {
  context: AiExecutionContext;
  intent: AiConversationIntent;
  state: AiConversationState;
}

export interface AiToolPlanner {
  plan(request: AiToolPlanningRequest): AiToolRequest | null;
}

export interface AiToolResult {
  schemaVersion: 1;
  toolName: AiToolName;
  kind: AiToolKind;
  outcome: 'success' | 'clarification_required' | 'denied' | 'error';
  data?: unknown;
  message?: string;
  presentedOptions?: readonly AiPresentedOption[];
  errorCode?: string;
}

export interface AiToolExecutionRequest {
  context: AiExecutionContext;
  conversationState: AiConversationState;
  config: AiToolExecutionConfig;
  tool: AiToolRequest;
}

export interface AiToolExecutor {
  execute(request: AiToolExecutionRequest): Promise<AiToolResult>;
}

export interface AiToolResponseComposition {
  text: string;
  provider: string;
  model: string;
  usage: AiUsage;
  latencyMs: number;
}

export interface AiToolResponseComposer {
  compose(input: {
    clinicName: string;
    preferredLanguage: string;
    responseStyle: string;
    intent: AiConversationIntent;
    result: AiToolResult;
    signal?: AbortSignal;
  }): Promise<AiToolResponseComposition>;
}

export interface AiToolAuditEvent {
  context: AiExecutionContext;
  toolName: AiToolName;
  kind: AiToolKind;
  outcome: AiToolResult['outcome'];
  errorCode?: string;
  latencyMs: number;
  occurredAt: string;
}

export interface AiToolAuditRecorder {
  record(event: AiToolAuditEvent): Promise<void>;
}

export interface AiToolMutationGuard {
  claim(context: AiExecutionContext, tool: AiToolRequest): Promise<boolean>;
}

export class NoopAiToolAuditRecorder implements AiToolAuditRecorder {
  async record(): Promise<void> {}
}

/** Mutations fail closed unless an atomic guard is explicitly injected. */
export class DenyAiToolMutationGuard implements AiToolMutationGuard {
  async claim(): Promise<boolean> { return false; }
}
