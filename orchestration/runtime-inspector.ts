import { IRuntimeInspector, ITaskSnapshot, IQueueSnapshot, IEventSnapshot } from './interfaces/observability.interface';
import { IMetricsCollector } from './interfaces/observability.interface';
import { IQueueBackend } from './interfaces/queue.interface';
import { IServiceDiscovery } from './interfaces/discovery.interface';
import { IEventStore } from './interfaces/persistence.interface';
import { IMCPRuntime, IMCPServerRegistry } from './interfaces/mcp.interface';

export class RuntimeInspector implements IRuntimeInspector {
  private metrics: IMetricsCollector;
  private queue: IQueueBackend;
  private discovery: IServiceDiscovery;
  private eventStore: IEventStore;
  private mcpRuntime?: IMCPRuntime;
  private mcpRegistry?: IMCPServerRegistry;
  private bootTime = new Date();

  constructor(
    metrics: IMetricsCollector,
    queue: IQueueBackend,
    discovery: IServiceDiscovery,
    eventStore: IEventStore,
    mcpRuntime?: IMCPRuntime,
    mcpRegistry?: IMCPServerRegistry
  ) {
    this.metrics = metrics;
    this.queue = queue;
    this.discovery = discovery;
    this.eventStore = eventStore;
    this.mcpRuntime = mcpRuntime;
    this.mcpRegistry = mcpRegistry;
  }

  async getHealth(): Promise<any> {
    const services = await this.discovery.listServices();
    const anyUnhealthy = services.some(s => s.status !== 'healthy');
    return {
      status: anyUnhealthy && services.length > 0 ? 'degraded' : 'healthy',
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
      if (event.event === 'task_routed' || event.event === 'task_queued') {
        const task = event.payload;
        taskMap.set(task.id, {
          id: task.id,
          status: task.status || 'queued',
          priority: task.priority || 'medium',
          dependencies: task.dependencies || [],
          retries: task.retries || 0
        });
      } else if (event.event === 'execution_succeeded') {
        const task = event.payload;
        const existing = taskMap.get(task.taskId);
        if (existing) {
          existing.status = 'succeeded';
          existing.executionTimeMs = task.durationMs;
        }
      } else if (event.event === 'execution_failed') {
        const task = event.payload;
        const existing = taskMap.get(task.taskId);
        if (existing) {
          existing.status = 'failed';
          existing.retries = task.attempts;
        }
      }
    }
    return Array.from(taskMap.values());
  }

  async getEvents(): Promise<IEventSnapshot[]> {
    const replayed = await this.eventStore.replayEvents();
    return replayed.map(r => ({
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
      jobs: activeJobs.map(j => ({
        id: j.id,
        priority: j.priority,
        retries: j.retries
      }))
    };
  }

  async getServices(): Promise<any[]> {
    const list = await this.discovery.listServices();
    return list.map(s => ({
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
      tools.push(...s.tools.map(t => `${s.name}:${t}`));
    }
    return tools;
  }

  async getMCPExecutions(): Promise<any[]> {
    return this.mcpRuntime ? await this.mcpRuntime.getExecutionsLog() : [];
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
      mcp: await this.getMCPSummary()
    };
  }
}
