import { IRuntimeManager } from '../orchestration/runtime-manager';
import { IEventBus } from '../orchestration/event-bus';
import { TaskRouter } from '../orchestration/task-router';
import { IAgentRegistry } from '../orchestration/agent-registry';
import { IEventStore } from '../orchestration/interfaces/persistence.interface';
import { ILogger } from '../orchestration/interfaces/logger.interface';

export class GhostStackOrchestrator {
  private runtimeManager: IRuntimeManager;
  private eventBus: IEventBus;
  private taskRouter: TaskRouter;
  private agentRegistry: IAgentRegistry;
  private eventStore?: IEventStore;
  private logger?: ILogger;

  constructor(
    runtimeManager: IRuntimeManager,
    eventBus: IEventBus,
    taskRouter: TaskRouter,
    agentRegistry: IAgentRegistry,
    eventStore?: IEventStore,
    logger?: ILogger
  ) {
    this.runtimeManager = runtimeManager;
    this.eventBus = eventBus;
    this.taskRouter = taskRouter;
    this.agentRegistry = agentRegistry;
    this.eventStore = eventStore;
    this.logger = logger;
  }

  async start(): Promise<string[]> {
    this.logger?.info("Starting GhostStack Unified Orchestrator Core...");

    if (this.eventStore) {
      this.logger?.info("Replaying historical state events for crash recovery...");
      const events = await this.eventStore.replayEvents();
      for (const event of events) {
        await this.taskRouter.replayEvent(event);
      }
      this.logger?.info(`Replayed ${events.length} events successfully.`);
    }

    const services = await this.runtimeManager.getActiveServices();
    this.logger?.info(`Active services boot-checked successfully`, { services });
    return services;
  }
}
