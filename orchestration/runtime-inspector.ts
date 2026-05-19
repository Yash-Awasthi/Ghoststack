import { IRuntimeInspector, ITaskSnapshot, IQueueSnapshot, IEventSnapshot } from "./interfaces/observability.interface";
import { IMetricsCollector } from "./interfaces/observability.interface";
import { IQueueBackend } from "./interfaces/queue.interface";
import { IServiceDiscovery } from "./interfaces/discovery.interface";
import { IEventStore } from "./interfaces/persistence.interface";
import { IMCPRuntime, IMCPServerRegistry } from "./interfaces/mcp.interface";
import { IGovernanceEngine, IApprovalWorkflow, ICognitiveTrace } from "./interfaces/governance.interface";
import { IEnvironmentTelemetry, IFilesystemSandbox, IExecutionEnvironment } from "./interfaces/environment.interface";
import { IWorkflowRegistry, IWorkflowTelemetry } from "./interfaces/workflow.interface";

export class RuntimeInspector implements IRuntimeInspector {
  private metrics: IMetricsCollector;
  private queue: IQueueBackend;
  private discovery: IServiceDiscovery;
  private eventStore: IEventStore;
  private mcpRuntime?: IMCPRuntime;
  private mcpRegistry?: IMCPServerRegistry;
  private governanceEngine?: IGovernanceEngine;
  private approvalWorkflow?: IApprovalWorkflow;
  private plansLog: ICognitiveTrace[] = [];
  private bootTime = new Date();

  // Environment Telemetry Context
  private browserTelemetry?: IEnvironmentTelemetry;
  private scrapingTelemetry?: IEnvironmentTelemetry;
  private fsSandbox?: IFilesystemSandbox;
  private envsList?: IExecutionEnvironment[];

  // Phase 8 Workflow Core Abstractions Context
  private workflowRegistry?: IWorkflowRegistry;
  private workflowTelemetry?: IWorkflowTelemetry;
  private workflowEngine?: any;

  constructor(
    metrics: IMetricsCollector,
    queue: IQueueBackend,
    discovery: IServiceDiscovery,
    eventStore: IEventStore,
    mcpRuntime?: IMCPRuntime,
    mcpRegistry?: IMCPServerRegistry,
    governanceEngine?: IGovernanceEngine,
    approvalWorkflow?: IApprovalWorkflow,
    browserTelemetry?: IEnvironmentTelemetry,
    scrapingTelemetry?: IEnvironmentTelemetry,
    fsSandbox?: IFilesystemSandbox,
    envsList?: IExecutionEnvironment[],
    workflowRegistry?: IWorkflowRegistry,
    workflowTelemetry?: IWorkflowTelemetry,
    workflowEngine?: any
  ) {
    this.metrics = metrics;
    this.queue = queue;
    this.discovery = discovery;
    this.eventStore = eventStore;
    this.mcpRuntime = mcpRuntime;
    this.mcpRegistry = mcpRegistry;
    this.governanceEngine = governanceEngine;
    this.approvalWorkflow = approvalWorkflow;

    this.browserTelemetry = browserTelemetry;
    this.scrapingTelemetry = scrapingTelemetry;
    this.fsSandbox = fsSandbox;
    this.envsList = envsList;

    this.workflowRegistry = workflowRegistry;
    this.workflowTelemetry = workflowTelemetry;
    this.workflowEngine = workflowEngine;
  }

  async getHealth(): Promise<any> {
    const services = await this.discovery.listServices();
    const anyUnhealthy = services.some((s) => s.status !== "healthy");
    return {
      status: anyUnhealthy && services.length > 0 ? "degraded" : "healthy",
      uptimeSeconds: Math.floor((Date.now() - this.bootTime.getTime()) / 1000),
      servicesCount: services.length
    };
  }

  async getMetrics(): Promise<any> {
    return this.metrics.getMetrics();
  }

  async getTasks(): Promise<ITaskSnapshot[]> {
    const events = await this.eventStore.replayEvents();
    const taskMap = new Map<string, ITaskSnapshot>();

    for (const event of events) {
      if (event.event === "task_routed" || event.event === "task_queued") {
        const task = event.payload;
        taskMap.set(task.id, {
          id: task.id,
          status: task.status || "queued",
          priority: task.priority || "medium",
          dependencies: task.dependencies || [],
          retries: task.retries || 0
        });
      } else if (event.event === "execution_succeeded") {
        const task = event.payload;
        const existing = taskMap.get(task.taskId);
        if (existing) {
          existing.status = "succeeded";
          existing.executionTimeMs = task.durationMs;
        }
      } else if (event.event === "execution_failed") {
        const task = event.payload;
        const existing = taskMap.get(task.taskId);
        if (existing) {
          existing.status = "failed";
          existing.retries = task.attempts;
        }
      }
    }
    return Array.from(taskMap.values());
  }

  async getEvents(): Promise<IEventSnapshot[]> {
    const replayed = await this.eventStore.replayEvents();
    return replayed.map((r) => ({
      event: r.event,
      timestamp: r.timestamp || new Date(),
      payload: r.payload
    }));
  }

  async getQueues(): Promise<IQueueSnapshot> {
    const dlq = await this.queue.getDeadLetterQueue();
    const activeCount = await this.queue.getQueueLength();
    const activeJobs = await this.queue.getActiveJobs();

    return {
      activeJobsCount: activeCount,
      deadLetterJobsCount: dlq.length,
      jobs: activeJobs.map((j) => ({
        id: j.id,
        priority: j.priority,
        retries: j.retries
      }))
    };
  }

  async getServices(): Promise<any[]> {
    const list = await this.discovery.listServices();
    return list.map((s) => ({
      name: s.name,
      status: s.status,
      lastCheck: s.lastCheck,
      port: s.details?.port,
      type: s.details?.type
    }));
  }

  async getMCPSummary(): Promise<any> {
    const metrics = this.mcpRuntime ? await this.mcpRuntime.getMetrics() : null;
    const list = this.mcpRegistry ? await this.mcpRegistry.listServers() : [];
    const logs = this.mcpRuntime ? await this.mcpRuntime.getExecutionsLog() : [];

    return {
      metrics,
      serversCount: list.length,
      executionsCount: logs.length
    };
  }

  async getMCPServers(): Promise<any[]> {
    return this.mcpRegistry ? await this.mcpRegistry.listServers() : [];
  }

  async getMCPTools(): Promise<string[]> {
    if (!this.mcpRegistry) return [];
    const servers = await this.mcpRegistry.listServers();
    const tools: string[] = [];
    for (const s of servers) {
      tools.push(...s.tools.map((t) => `${s.name}:${t}`));
    }
    return tools;
  }

  async getMCPExecutions(): Promise<any[]> {
    return this.mcpRuntime ? await this.mcpRuntime.getExecutionsLog() : [];
  }

  // Cognitive Governance Endpoints
  async getGovernanceInfo(): Promise<any> {
    if (!this.governanceEngine) return {};
    const engine = this.governanceEngine as any;
    return {
      constraints: engine.getConstraints ? engine.getConstraints().map((c: any) => c.name) : [],
      policies: engine.getPolicies ? engine.getPolicies().map((p: any) => p.name) : [],
      guardrails: engine.getGuardrails ? engine.getGuardrails().map((g: any) => g.name) : []
    };
  }

  async getApprovalsList(): Promise<any[]> {
    return this.approvalWorkflow ? await this.approvalWorkflow.listRecords() : [];
  }

  async getPlansList(): Promise<ICognitiveTrace[]> {
    return [...this.plansLog];
  }

  async getGuardrailsInfo(): Promise<any> {
    if (!this.governanceEngine) return {};
    const engine = this.governanceEngine as any;
    const guardrails = engine.getGuardrails ? engine.getGuardrails() : [];
    return {
      activeGuardrailsCount: guardrails.length,
      stormThreshold: 5
    };
  }

  // Phase 7 Environment Inspection APIs
  getBrowserMetrics(): any {
    if (!this.browserTelemetry) return {};
    return {
      activeSessions: this.browserTelemetry.browserSessionsActive,
      navigationHistory: this.browserTelemetry.navigationHistory,
      totalBytesWritten: this.browserTelemetry.totalBytesWritten
    };
  }

  getScrapingMetrics(): any {
    if (!this.scrapingTelemetry) return {};
    return {
      totalBytesFetched: this.scrapingTelemetry.totalBytesFetched,
      navigationHistory: this.scrapingTelemetry.navigationHistory
    };
  }

  getSandboxMetrics(): any {
    if (!this.fsSandbox) return {};
    return {
      writeLog: this.fsSandbox.getWriteLog()
    };
  }

  getEnvironmentsList(): any[] {
    if (!this.envsList) return [];
    return this.envsList.map((e) => ({
      name: e.name,
      capabilities: e.capabilities
    }));
  }

  // Phase 8 Workflow Diagnostics Observability APIs
  getWorkflowsList(): any[] {
    if (!this.workflowRegistry) return [];
    return this.workflowRegistry.listWorkflows().map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      tasksCount: w.tasks.length
    }));
  }

  getWorkflowExecution(executionId: string): any {
    if (!this.workflowTelemetry) return null;
    const history = this.workflowTelemetry.getExecutionHistory();
    return history.find((e) => e.id === executionId) || null;
  }

  getWorkflowReplays(): any[] {
    if (!this.workflowTelemetry) return [];
    // Filter executions that have replay patterns
    return this.workflowTelemetry.getExecutionHistory().filter((e) => e.id.includes("replay"));
  }

  getWorkflowTemplates(): any[] {
    if (!this.workflowRegistry) return [];
    return this.workflowRegistry.listTemplates().map((t) => ({
      templateId: t.templateId,
      name: t.name,
      description: t.description
    }));
  }

  getWorkflowTelemetryStats(): any {
    if (!this.workflowTelemetry) return {};
    const history = this.workflowTelemetry.getExecutionHistory();
    return {
      totalExecutions: history.length,
      succeededCount: history.filter((h) => h.status === "succeeded").length,
      failedCount: history.filter((h) => h.status === "failed").length,
      rejectedCount: history.filter((h) => h.status === "rejected").length,
      pendingCount: history.filter((h) => h.status === "pending").length
    };
  }

  recordPlan(plan: ICognitiveTrace): void {
    this.plansLog.push(plan);
  }

  async getSnapshots(): Promise<any> {
    return {
      timestamp: new Date(),
      health: await this.getHealth(),
      metrics: await this.getMetrics(),
      queues: await this.getQueues(),
      services: await this.getServices(),
      events: await this.getEvents(),
      tasks: await this.getTasks(),
      mcp: await this.getMCPSummary(),
      governance: await this.getGovernanceInfo()
    };
  }
}
