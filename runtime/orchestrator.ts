import { IRuntimeManager } from '../orchestration/runtime-manager';
import { IEventBus } from '../orchestration/event-bus';
import { TaskRouter, Task } from '../orchestration/task-router';
import { IAgentRegistry } from '../orchestration/agent-registry';
import { IEventStore } from '../orchestration/interfaces/persistence.interface';
import { ILogger } from '../orchestration/interfaces/logger.interface';
import { TaskDependencyResolver } from '../orchestration/dependency-resolver';
import { MemoryQueueBackend } from '../orchestration/queue-backend';
import { TaskExecutor } from '../orchestration/task-executor';
import { IMetricsCollector, ITraceRecorder } from '../orchestration/interfaces/observability.interface';

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
  private metrics?: IMetricsCollector;
  private tracer?: ITraceRecorder;
  private bootTime = new Date();

  constructor(
    runtimeManager: IRuntimeManager,
    eventBus: IEventBus,
    taskRouter: TaskRouter,
    agentRegistry: IAgentRegistry,
    eventStore?: IEventStore,
    logger?: ILogger,
    queue?: MemoryQueueBackend,
    executor?: TaskExecutor,
    metrics?: IMetricsCollector,
    tracer?: ITraceRecorder
  ) {
    this.runtimeManager = runtimeManager;
    this.eventBus = eventBus;
    this.taskRouter = taskRouter;
    this.agentRegistry = agentRegistry;
    this.eventStore = eventStore;
    this.logger = logger;
    this.metrics = metrics;
    this.tracer = tracer;
    
    this.resolver = new TaskDependencyResolver();
    this.queue = queue || new MemoryQueueBackend();
    this.executor = executor;
  }

  async start(): Promise<string[]> {
    const startTimeMs = Date.now();
    this.logger?.info("Starting GhostStack Unified Orchestrator Core...");
    const traceSpan = this.tracer?.startSpan("orchestrator.start");

    if (this.eventStore) {
      this.logger?.info("Replaying historical state events for crash recovery...");
      const replayStart = Date.now();
      const events = await this.eventStore.replayEvents();
      for (const event of events) {
        await this.taskRouter.replayEvent(event);
      }
      const replayDuration = Date.now() - replayStart;
      this.metrics?.recordTiming("replay.duration", replayDuration);
      this.logger?.info(`Replayed ${events.length} events successfully.`);
    }

    const services = await this.runtimeManager.getActiveServices();
    this.logger?.info(`Active services boot-checked successfully`, { services });
    
    const bootstrapDuration = Date.now() - startTimeMs;
    this.metrics?.recordTiming("bootstrap.duration", bootstrapDuration);
    this.metrics?.recordGauge("orchestrator.uptime", 1);

    if (traceSpan) {
      this.tracer?.endSpan(traceSpan.spanId, { status: "success", servicesCount: services.length });
    }

    return services;
  }

  async submitAndExecuteTasks(tasks: Task[]): Promise<void> {
    this.logger?.info(`Submitting ${tasks.length} tasks to dependency validation loop...`);
    const traceSpan = this.tracer?.startSpan("submit.tasks", undefined, { count: tasks.length });
    
    const sortedTasks = this.resolver.resolveOrder(tasks);
    this.logger?.info(`Tasks sorted in topological order`, { sorted: sortedTasks.map(t => t.id) });

    for (const task of sortedTasks) {
      await this.taskRouter.route(task);
      this.metrics?.increment("task.submitted");
      
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
      
      const length = await this.queue.getQueueLength();
      this.metrics?.recordGauge("queue.size", length);
    }

    if (this.executor) {
      this.logger?.info("Driving executor task processing loop...");
      while (await this.queue.getQueueLength() > 0) {
        await this.executor.executeNext();
      }
      this.logger?.info("All queued tasks executed successfully.");
    }

    if (traceSpan) {
      this.tracer?.endSpan(traceSpan.spanId, { status: "success" });
    }
  }

  getQueue(): MemoryQueueBackend {
    return this.queue;
  }
}
