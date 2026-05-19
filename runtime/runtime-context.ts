import * as path from "path";
import { GhostStackOrchestrator } from "./orchestrator";
import { RuntimeManager } from "../orchestration/runtime-manager";
import { YAMLConfigLoader } from "./config-loader";
import { LocalEventBus } from "../orchestration/event-bus";
import { TaskRouter } from "../orchestration/task-router";
import { LocalAgentRegistry } from "../orchestration/agent-registry";
import {
  FileEventStore,
  FileRuntimePersistence,
  backupRuntimePersistence
} from "../orchestration/persistence-manager";
import { StructuredLogger } from "../orchestration/logger";
import { MemoryQueueBackend } from "../orchestration/queue-backend";
import { TaskExecutor } from "../orchestration/task-executor";
import { MetricsCollector, TraceRecorder } from "../orchestration/observability-manager";
import { LocalServiceDiscovery, HealthMonitor } from "../orchestration/service-discovery";
import { ApprovalWorkflow } from "../orchestration/approval-workflow";
import { BrowserExecutionAdapter } from "../orchestration/browser-adapter";
import { ScrapingExecutionAdapter } from "../orchestration/scraping-adapter";
import { FlociExecutionAdapter } from "../orchestration/floci-adapter";
import { EnvironmentTelemetry } from "../orchestration/environment-telemetry";
import {
  WorkflowRegistry,
  WorkflowTelemetry,
  WorkflowEngine,
  BrowserResearchWorkflowTemplate,
  LocalCloudProvisioningTemplate,
  DocumentProcessingTemplate,
  SpecToExecutionTemplate,
  GovernedEtlWorkflowTemplate
} from "../orchestration/workflow-engine";
import { RuntimeInspector } from "../orchestration/runtime-inspector";
import { loadWorkflowSpecsFromDir, specToWorkflowDefinition } from "../orchestration/spec-loader";
import { createRuntimeSandbox, RuntimeSandboxLayout } from "../orchestration/runtime-sandbox";

export type GhostStackRuntimeContext = {
  repoRoot: string;
  sandbox: RuntimeSandboxLayout;
  runtimeDbDir: string;
  logger: StructuredLogger;
  eventBus: LocalEventBus;
  eventStore: FileEventStore;
  persistence: FileRuntimePersistence;
  metrics: MetricsCollector;
  tracer: TraceRecorder;
  queue: MemoryQueueBackend;
  discovery: LocalServiceDiscovery;
  healthMonitor: HealthMonitor;
  approval: ApprovalWorkflow;
  orchestrator: GhostStackOrchestrator;
  registry: WorkflowRegistry;
  workflowTelemetry: WorkflowTelemetry;
  workflowEngine: WorkflowEngine;
  inspector: RuntimeInspector;
  browserAdapter: BrowserExecutionAdapter;
  scrapingAdapter: ScrapingExecutionAdapter;
  flociAdapter: FlociExecutionAdapter;
  configLoader: YAMLConfigLoader;
};

export async function createRuntimeContext(repoRoot: string): Promise<GhostStackRuntimeContext> {
  const sandbox = createRuntimeSandbox(repoRoot);
  const runtimeDbDir = sandbox.dataDir;
  const eventLogPath = path.join(runtimeDbDir, "events.jsonl");
  const cacheDbPath = path.join(runtimeDbDir, "cache.json");

  const loader = new YAMLConfigLoader({
    portsPath: path.join(repoRoot, "runtime", "ports.yaml"),
    servicesPath: path.join(repoRoot, "runtime", "services.yaml"),
    healthchecksPath: path.join(repoRoot, "runtime", "healthchecks.yaml"),
    runtimePath: path.join(repoRoot, "runtime", "ghoststack.runtime.yaml")
  });

  const logger = new StructuredLogger();
  const eventBus = new LocalEventBus();
  const eventStore = new FileEventStore(eventLogPath);
  const persistence = new FileRuntimePersistence(cacheDbPath);
  const runtimeManager = new RuntimeManager(loader);
  const agentRegistry = new LocalAgentRegistry();
  const taskRouter = new TaskRouter(eventBus, eventStore);

  const metrics = new MetricsCollector();
  const tracer = new TraceRecorder();
  const queue = new MemoryQueueBackend();
  const discovery = new LocalServiceDiscovery();
  const healthMonitor = new HealthMonitor(loader, discovery);
  const approval = new ApprovalWorkflow(eventStore, eventBus);

  const offlineMode =
    process.env.GHOSTSTACK_OFFLINE_MODE === "1" ||
    (process.env.GHOSTSTACK_OFFLINE_MODE ?? "").toLowerCase() === "true" ||
    process.env.GHOSTSTACK_OFFLINE_MODE === undefined;

  const browserTelemetry = new EnvironmentTelemetry();
  const scrapingTelemetry = new EnvironmentTelemetry();
  const browserAdapter = new BrowserExecutionAdapter(browserTelemetry, offlineMode);
  const scrapingAdapter = new ScrapingExecutionAdapter(scrapingTelemetry, offlineMode);
  const flociStrict =
    process.env.GHOSTSTACK_FLOCI_STRICT === "1" ||
    (process.env.GHOSTSTACK_FLOCI_STRICT ?? "").toLowerCase() === "true";
  const flociAdapter = new FlociExecutionAdapter({
    strict: flociStrict,
    onEvent: async (event, payload) => {
      await eventBus.publish(event, payload);
      await eventStore.saveEvent(event, payload);
    }
  });

  const executor = new TaskExecutor(
    queue,
    eventBus,
    persistence,
    logger,
    [browserAdapter, scrapingAdapter, flociAdapter],
    metrics,
    tracer
  );

  const orchestrator = new GhostStackOrchestrator(
    runtimeManager,
    eventBus,
    taskRouter,
    agentRegistry,
    eventStore,
    logger,
    queue,
    executor,
    metrics,
    tracer,
    undefined,
    undefined,
    approval
  );

  const registry = new WorkflowRegistry();
  const workflowTelemetry = new WorkflowTelemetry(persistence);
  const workflowEngine = new WorkflowEngine(registry, workflowTelemetry, orchestrator, approval);

  registry.registerTemplate(new BrowserResearchWorkflowTemplate());
  registry.registerTemplate(new LocalCloudProvisioningTemplate());
  registry.registerTemplate(new DocumentProcessingTemplate());
  registry.registerTemplate(new SpecToExecutionTemplate());
  registry.registerTemplate(new GovernedEtlWorkflowTemplate());

  for (const { filePath, spec } of loadWorkflowSpecsFromDir(sandbox.specsDir)) {
    const workflowId = path.basename(path.dirname(filePath));
    registry.registerWorkflow(specToWorkflowDefinition(spec, workflowId));
    logger.info("Loaded workflow spec", { workflowId, templateId: spec.template_id, filePath });
  }

  const inspector = new RuntimeInspector(
    metrics,
    queue,
    discovery,
    eventStore,
    undefined,
    undefined,
    undefined,
    approval,
    browserTelemetry,
    scrapingTelemetry,
    undefined,
    undefined,
    registry,
    workflowTelemetry,
    workflowEngine
  );

  if (process.env.GHOSTSTACK_BACKUP_ON_START === "1") {
    const backups = backupRuntimePersistence(eventStore, persistence, sandbox.backupsDir);
    logger.info("Runtime persistence backup created", backups);
  }

  return {
    repoRoot,
    sandbox,
    runtimeDbDir,
    logger,
    eventBus,
    eventStore,
    persistence,
    metrics,
    tracer,
    queue,
    discovery,
    healthMonitor,
    approval,
    orchestrator,
    registry,
    workflowTelemetry,
    workflowEngine,
    inspector,
    browserAdapter,
    scrapingAdapter,
    flociAdapter,
    configLoader: loader
  };
}

/** Boot orchestrator replay + federation health probes. */
export async function startRuntime(ctx: GhostStackRuntimeContext): Promise<string[]> {
  const services = await ctx.orchestrator.start();
  await ctx.healthMonitor.startMonitoring();
  const flociHealth = await ctx.flociAdapter.probeHealth();
  ctx.metrics.recordTiming("floci.health_probe_ms", flociHealth.latencyMs);
  ctx.metrics.recordGauge("floci.reachable", flociHealth.reachable ? 1 : 0);
  ctx.logger.info("Floci health probe complete", {
    reachable: flociHealth.reachable,
    endpoint: flociHealth.endpoint,
    healthPath: flociHealth.healthPath
  });
  return services;
}

export async function stopRuntime(ctx: GhostStackRuntimeContext): Promise<void> {
  await ctx.healthMonitor.stopMonitoring();
}
