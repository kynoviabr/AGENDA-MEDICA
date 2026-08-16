import type { AiToolExecutionRequest, AiToolExecutor } from './domain.ts';

export class CompositeAiToolExecutor implements AiToolExecutor {
  constructor(private readonly scheduling: AiToolExecutor, private readonly knowledge: AiToolExecutor) {}
  execute(request: AiToolExecutionRequest) {
    return request.tool.name === 'search_administrative_knowledge'
      ? this.knowledge.execute(request)
      : this.scheduling.execute(request);
  }
}
