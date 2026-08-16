export type AiToolErrorCode =
  | 'AI_TOOL_INVALID_REQUEST'
  | 'AI_TOOL_NOT_REGISTERED'
  | 'AI_TOOL_INTENT_NOT_ALLOWED'
  | 'AI_TOOL_READ_DISABLED'
  | 'AI_TOOL_MUTATION_DISABLED'
  | 'AI_TOOL_READ_NOT_VALIDATED'
  | 'AI_TOOL_KNOWLEDGE_DISABLED'
  | 'AI_TOOL_KNOWLEDGE_NOT_VALIDATED'
  | 'AI_TOOL_TENANT_MISMATCH'
  | 'AI_TOOL_CONVERSATION_MISMATCH'
  | 'AI_TOOL_AUTHORIZATION_DENIED'
  | 'AI_TOOL_ENTITY_NOT_FOUND'
  | 'AI_TOOL_ENTITY_AMBIGUOUS'
  | 'AI_TOOL_EXECUTION_FAILED';

export class AiToolError extends Error {
  constructor(
    readonly code: AiToolErrorCode,
    message: string,
    readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'AiToolError';
  }
}
