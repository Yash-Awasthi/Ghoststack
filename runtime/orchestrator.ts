import { IRuntimeManager } from '../orchestration/runtime-manager';
import { IEventBus } from '../orchestration/event-bus';
import { TaskRouter, Task } from '../orchestration/task-router';
import { IAgentRegistry } from '../orchestration/agent-registry';
import { IEventStore } from '../orchestration/interfaces/persistence.interface';
import { ILogger } from '../orchestration/interfaces/logger.interface';
import { TaskDependencyResolver } from '../orchestration/dependency-resolver';
import { MemoryQueueBackend } from '../orchestration/queue-backend';
import { TaskExecutor } from '../orchestration/task-executor';

export class GhostStackOrchestrator {
  private runtimeManager: IRuntimeManager;
  private eventBus: IEventBus;
  private taskRouter: TaskRouter;
  private agentRegistry: IAgentRegistry;
  private eventStore?: IEventStore;
  private logger?: ILogger;
  
  private resolver: TaskDependencyResolver;
  private queue: MemoryQueueBackend;
  private executor?: TaskExecutor;

  constructor(
    runtimeManager: IRuntimeManager,
    eventBus: IEventBus,
    taskRouter: TaskRouter,
    agentRegistry: IAgentRegistry,
    eventStore?: IEventStore,
    logger?: ILogger,
    queue?: MemoryQueueBackend,
    executor?: TaskExecutor
  ) {
    this.runtimeManager = runtimeManager;
    this.eventBus = eventBus;
    this.taskRouter = taskRouter;
    this.agentRegistry = agentRegistry;
    this.eventStore = eventStore;
    this.logger = logger;
    
    this.resolver = new TaskDependencyResolver();
    this.queue = queue || new MemoryQueueBackend();
    this.executor = executor;
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

  async submitAndExecuteTasks(tasks: Task[]): Promise<void> {
    this.logger?.info(`Submitting ${tasks.length} tasks to dependency validation loop...`);
    
    const sortedTasks = this.resolver.resolveOrder(tasks);
    this.logger?.info(`Tasks sorted in topological order`, { sorted: sortedTasks.map(t => t.id) });

    for (const task of sortedTasks) {
      await this.taskRouter.route(task);
      
      await this.queue.push({
        id: task.id,
        payload: {
          type: "floci",
          payload: task.description.includes("bucket")
            ? { action: "create_s3_bucket", bucketName: task.id }
            : task.description.includes("queue")
            ? { action: "create_sqs_queue", queueName: task.id }
            : { action: "create_dynamodb_table", tableName: task.id }
        },
        priority: task.priority as any || "medium",
        retries: 0,
        maxRetries: 3,
        createdAt: new Date()
      });
    }

    if (this.executor) {
      this.logger?.info("Driving executor task processing loop...");
      while (await this.queue.getQueueLength() > 0) {
        await this.executor.executeNext();
      }
      this.logger?.info("All queued tasks executed successfully.");
    }
  }

  getQueue(): MemoryQueueBackend {
    return this.queue;
  }
}
