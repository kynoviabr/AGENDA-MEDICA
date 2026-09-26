import type { AiConversationControl, AiHandoffPriority, AiHandoffRecord } from './domain.ts';

const PRIORITY_ORDER: Record<AiHandoffPriority, number> = { urgent: 0, high: 1, normal: 2 };

export function sortHandoffQueue(items: readonly AiHandoffRecord[]) {
  return [...items].sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
    || new Date(left.requestedAt).getTime() - new Date(right.requestedAt).getTime());
}

export function canAssignedStaffRespond(control: AiConversationControl, userId: string) {
  return control.mode === 'human_active'
    && Boolean(control.activeHandoffId)
    && Boolean(userId)
    && control.assignedUserId === userId;
}

export function shouldRunAiPipeline(control: AiConversationControl) {
  return control.mode === 'ai_active';
}
