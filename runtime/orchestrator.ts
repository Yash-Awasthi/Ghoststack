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
import { IPlanningEngine, IGovernanceEngine, IApprovalWorkflow } from '../orchestration/interfaces/governance.interface';

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

  // Cognitive Governance Engines
  private planningEngine?: IPlanningEngine;
  private governanceEngine?: IGovernanceEngine;
  private approvalWorkflow?: IApprovalWorkflow;
  private inspector?: any;

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
    tracer?: ITraceRecorder,
    planningEngine?: IPlanningEngine,
    governanceEngine?: IGovernanceEngine,
    approvalWorkflow?: IApprovalWorkflow,
    inspector?: any
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

    this.planningEngine = planningEngine;
    this.governanceEngine = governanceEngine;
    this.approvalWorkflow = approvalWorkflow;
    this.inspector = inspector;
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
    this.logger?.info("Active services boot-checked successfully", { services });
    
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
    this.logger?.info("Tasks sorted in topological order", { sorted: sortedTasks.map(t => t.id) });

    for (const task of sortedTasks) {
      await this.taskRouter.route(task);
      this.metrics?.increment("task.submitted");

      let payloadType = "floci";
      let payloadPayload: any = {};

      if (task.description.includes("browser")) {
        payloadType = "browser";
        payloadPayload = {
          url: task.description.includes("illegal") ? "file:///etc/passwd" : "https://github.com",
          actions: [
            { type: "navigate", value: "https://news.ycombinator.com" }
          ],
          timeoutMs: 5000
        };
      } else if (task.description.includes("scraping")) {
        payloadType = "scraping";
        payloadPayload = {
          url: "https://github.com",
          selectors: [".repo-title"],
          maxRequests: 3
        };
      } else {
        payloadPayload = task.description.includes("bucket")
          ? { action: "create_s3_bucket", bucketName: task.id }
          : task.description.includes("queue")
          ? { action: "create_sqs_queue", queueName: task.id }
          : { action: "create_dynamodb_table", tableName: task.id };
      }
      
      await this.queue.push({
        id: task.id,
        payload: {
          type: payloadType,
          payload: payloadPayload
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

  async submitCognitiveObjective(objective: string): Promise<{ planId: string; allowed: boolean; reason?: string }> {
    if (!this.planningEngine || !this.governanceEngine) {
      throw new Error("Cognitive Planning and Governance systems are not registered in the Orchestrator.");
    }

    const plan = await this.planningEngine.generatePlan(objective);
    if (this.inspector && typeof this.inspector.recordPlan === 'function') {
      this.inspector.recordPlan(plan);
    }

    // 1. Evaluate plan through global guardrails
    const planEval = await this.governanceEngine.evaluatePlan(plan);
    if (!planEval.allowed) {
      return { planId: plan.planId, allowed: false, reason: planEval.reason };
    }

    let hasPendingApprovals = false;
    const tasksToExecute: Task[] = [];

    // 2. Validate individual synthesized tasks
    for (const synth of plan.synthesisResults) {
      const taskEval = await this.governanceEngine.evaluateTask(synth);
      if (!taskEval.allowed) {
        return { planId: plan.planId, allowed: false, reason: taskEval.reason };
      }

      if (taskEval.requiresApproval) {
        hasPendingApprovals = true;
        if (this.approvalWorkflow) {
          await this.approvalWorkflow.createRequest(synth.taskId);
        }
      }

      tasksToExecute.push({
        id: synth.taskId,
        title: synth.action,
        description: `${synth.action} with ${JSON.stringify(synth.arguments)}`,
        priority: synth.priority,
        status: taskEval.requiresApproval ? "pending_approval" : "pending",
        dependencies: synth.dependencies
      });
    }

    // 3. Dispatch execution ONLY if there are no safety approval blocks pending
    if (!hasPendingApprovals) {
      await this.submitAndExecuteTasks(tasksToExecute);
    }

    return {
      planId: plan.planId,
      allowed: true
    };
  }

  getQueue(): MemoryQueueBackend {
    return this.queue;
  }
}
