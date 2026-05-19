import { ITaskExecutor, IExecutionAdapter, IExecutionContext } from "./interfaces/execution.interface";
import { IQueueBackend } from "./interfaces/queue.interface";
import { IEventBus } from "./event-bus";
import { IRuntimePersistence } from "./interfaces/persistence.interface";
import { ILogger } from "./interfaces/logger.interface";
import { IMetricsCollector, ITraceRecorder } from "./interfaces/observability.interface";

export class TaskExecutor implements ITaskExecutor {
  private queue: IQueueBackend;
  private bus: IEventBus;
  private persistence: IRuntimePersistence;
  private logger: ILogger;
  private adapters: IExecutionAdapter[];
  private metrics?: IMetricsCollector;
  private tracer?: ITraceRecorder;

  constructor(
    queue: IQueueBackend,
    bus: IEventBus,
    persistence: IRuntimePersistence,
    logger: ILogger,
    adapters: IExecutionAdapter[],
    metrics?: IMetricsCollector,
    tracer?: ITraceRecorder
  ) {
    this.queue = queue;
    this.bus = bus;
    this.persistence = persistence;
    this.logger = logger;
    this.adapters = adapters;
    this.metrics = metrics;
    this.tracer = tracer;
  }

  async start(): Promise<void> {
    this.logger.info("Task Executor core runtime started.");
  }

  async executeNext(): Promise<boolean> {
    const job = await this.queue.pop();
    if (!job) return false;

    // Track active queue size reduction
    const length = await this.queue.getQueueLength();
    this.metrics?.recordGauge("queue.size", length);

    const taskType = job.payload?.type || "floci";
    const adapter = this.adapters.find((a) => a.canExecute(taskType));

    if (!adapter) {
      this.logger.error(`No executable adapter found for task type: ${taskType}`);
      await this.queue.moveToDeadLetter(job, `Unsupported task type: ${taskType}`);
      this.metrics?.increment("task.failed");
      this.metrics?.increment("task.dead_letter");
      return false;
    }

    const context: IExecutionContext = {
      taskId: job.id,
      startTime: new Date(),
      attempt: job.retries + 1,
      environment: {},
      logger: this.logger
    };

    this.metrics?.increment("task.executed");
    const traceSpan = this.tracer?.startSpan("task.execute", undefined, { taskId: job.id, attempt: context.attempt });

    await this.bus.publish("execution_started", { taskId: job.id, timestamp: new Date() });

    try {
      const startTimeMs = Date.now();
      const result = await adapter.execute(job.payload, context);
      const durationMs = Date.now() - startTimeMs;

      this.metrics?.recordTiming("task.latency", durationMs);
      this.metrics?.increment("task.success");

      await this.persistence.saveState(job.id, {
        status: "success",
        result,
        timestamp: new Date()
      });

      await this.bus.publish("execution_succeeded", {
        taskId: job.id,
        result,
        durationMs,
        timestamp: new Date()
      });

      if (traceSpan) {
        this.tracer?.endSpan(traceSpan.spanId, { status: "success", durationMs });
      }

      return true;
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      this.logger.error(`Task ${job.id} execution failed: ${errorMessage}`);

      this.metrics?.increment("task.failed");

      await this.persistence.saveState(job.id, {
        status: "failed",
        error: errorMessage,
        timestamp: new Date()
      });

      await this.bus.publish("execution_failed", {
        taskId: job.id,
        error: errorMessage,
        attempts: context.attempt,
        timestamp: new Date()
      });

      if (traceSpan) {
        this.tracer?.endSpan(traceSpan.spanId, { status: "failed", error: errorMessage });
      }

      // Handle retry scheduling
      job.retries += 1;
      if (job.retries >= job.maxRetries) {
        this.metrics?.increment("task.dead_letter");
      } else {
        this.metrics?.increment("task.retry");
      }
      await this.queue.push(job); // will trigger dead letter inside push if exhausted

      return false;
    }
  }
}
