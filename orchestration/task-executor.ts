import { ITaskExecutor, IExecutionAdapter, IExecutionContext } from './interfaces/execution.interface';
import { IQueueBackend } from './interfaces/queue.interface';
import { IEventBus } from './event-bus';
import { IRuntimePersistence } from './interfaces/persistence.interface';
import { ILogger } from './interfaces/logger.interface';

export class TaskExecutor implements ITaskExecutor {
  private queue: IQueueBackend;
  private bus: IEventBus;
  private persistence: IRuntimePersistence;
  private logger: ILogger;
  private adapters: IExecutionAdapter[];

  constructor(
    queue: IQueueBackend,
    bus: IEventBus,
    persistence: IRuntimePersistence,
    logger: ILogger,
    adapters: IExecutionAdapter[]
  ) {
    this.queue = queue;
    this.bus = bus;
    this.persistence = persistence;
    this.logger = logger;
    this.adapters = adapters;
  }

  async start(): Promise<void> {
    this.logger.info("Task Executor core runtime started.");
  }

  async executeNext(): Promise<boolean> {
    const job = await this.queue.pop();
    if (!job) return false;

    // Check if the payload is flat or nested
    const taskType = job.payload?.type || "floci";
    const adapter = this.adapters.find(a => a.canExecute(taskType));

    if (!adapter) {
      this.logger.error(`No executable adapter found for task type: ${taskType}`);
      await this.queue.moveToDeadLetter(job, `Unsupported task type: ${taskType}`);
      return false;
    }

    const context: IExecutionContext = {
      taskId: job.id,
      startTime: new Date(),
      attempt: job.retries + 1,
      environment: {},
      logger: this.logger
    };

    await this.bus.publish("execution_started", { taskId: job.id, timestamp: new Date() });

    try {
      const result = await adapter.execute(job.payload, context);
      
      await this.persistence.saveState(job.id, {
        status: "success",
        result,
        timestamp: new Date()
      });

      await this.bus.publish("execution_succeeded", {
        taskId: job.id,
        result,
        timestamp: new Date()
      });

      return true;
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      this.logger.error(`Task ${job.id} execution failed: ${errorMessage}`);

      await this.persistence.saveState(job.id, {
        status: "failed",
        error: errorMessage,
        timestamp: new Date()
      });

      await this.bus.publish("execution_failed", {
        taskId: job.id,
        error: errorMessage,
        timestamp: new Date()
      });

      // Handle retry scheduling
      job.retries += 1;
      await this.queue.push(job); // will trigger dead letter inside push if exhausted

      return false;
    }
  }
}
