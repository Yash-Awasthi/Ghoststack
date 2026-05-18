import { IRuntimeManager } from '../orchestration/runtime-manager';
import { IEventBus } from '../orchestration/event-bus';
import { TaskRouter } from '../orchestration/task-router';
import { IAgentRegistry } from '../orchestration/agent-registry';

export class GhostStackOrchestrator {
  private runtimeManager: IRuntimeManager;
  private eventBus: IEventBus;
  private taskRouter: TaskRouter;
  private agentRegistry: IAgentRegistry;

  constructor(
    runtimeManager: IRuntimeManager,
    eventBus: IEventBus,
    taskRouter: TaskRouter,
    agentRegistry: IAgentRegistry
  ) {
    this.runtimeManager = runtimeManager;
    this.eventBus = eventBus;
    this.taskRouter = taskRouter;
    this.agentRegistry = agentRegistry;
  }

  async start(): Promise<string[]> {
    console.log("Starting GhostStack Unified Orchestrator Nucleus...");
    const services = await this.runtimeManager.getActiveServices();
    console.log(`Active services: ${services.join(', ')}`);
    return services;
  }
}
