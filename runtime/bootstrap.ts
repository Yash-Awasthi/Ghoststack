import { GhostStackOrchestrator } from "./orchestrator";
import { RuntimeManager } from "../orchestration/runtime-manager";
import { YAMLConfigLoader } from "./config-loader";
import { LocalEventBus } from "../orchestration/event-bus";
import { TaskRouter } from "../orchestration/task-router";
import { LocalAgentRegistry } from "../orchestration/agent-registry";
import { FileEventStore, FileRuntimePersistence } from "../orchestration/persistence-manager";
import { StructuredLogger } from "../orchestration/logger";
import { MemoryQueueBackend } from "../orchestration/queue-backend";
import { TaskExecutor } from "../orchestration/task-executor";
import { MetricsCollector, TraceRecorder } from "../orchestration/observability-manager";
import { LocalServiceDiscovery } from "../orchestration/service-discovery";
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
  SpecToExecutionTemplate
} from "../orchestration/workflow-engine";
import * as path from "path";
import * as fs from "fs";

async function bootstrap() {
  console.log("\x1b[35m");
  console.log("===============================================================================");
  console.log("   _____ _               _    _____ _             _      __      __ __   __ ");
  console.log("  / ____| |             | |  / ____| |           | |     \\ \\    / //_ | /_ |");
  console.log(" | |  __| |__   ___  ___| |_| (___ | |_ __ _  ___| | __   \\ \\  / /  | |  | |");
  console.log(" | | |_ | '_ \\ / _ \\/ __| __|\\___ \\| __/ _` |/ __| |/ /    \\ \\/ /   | |  | |");
  console.log(" | |__| | | | | (_) \\__ \\ |_ ____) | || (_| | (__|   <      \\  /    | |  | |");
  console.log("  \\_____|_| |_|\\___/|___/\\__|_____/ \\__\\__,_|\\___|_|\\_\\      \\/     |_|  |_|");
  console.log("                                                                               ");
  console.log("       LOCAL-FIRST AUTONOMOUS CLOUD ENGINE - POLISHED V1.1 PLATFORM            ");
  console.log("===============================================================================");
  console.log("\x1b[0m");

  const runtimeDbDir = path.join(__dirname, "../data-runtime");
  if (!fs.existsSync(runtimeDbDir)) {
    fs.mkdirSync(runtimeDbDir, { recursive: true });
  }

  const eventLogPath = path.join(runtimeDbDir, "events.jsonl");
  const cacheDbPath = path.join(runtimeDbDir, "cache.json");

  console.log(`[BOOT] Initializing database directories at: ${runtimeDbDir}`);
  console.log(`[BOOT] Telemetry events log path: ${eventLogPath}`);
  console.log(`[BOOT] Persistence database path: ${cacheDbPath}`);

  // 1. Initialize Core Substrates
  const loader = new YAMLConfigLoader({
    portsPath: path.join(__dirname, "./ports.yaml"),
    servicesPath: path.join(__dirname, "./services.yaml"),
    healthchecksPath: path.join(__dirname, "./healthchecks.yaml"),
    runtimePath: path.join(__dirname, "./ghoststack.runtime.yaml")
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
  new LocalServiceDiscovery();
  const approval = new ApprovalWorkflow(eventStore, eventBus);

  const browserAdapter = new BrowserExecutionAdapter(new EnvironmentTelemetry(), true);
  const scrapingAdapter = new ScrapingExecutionAdapter(new EnvironmentTelemetry(), true);
  const flociAdapter = new FlociExecutionAdapter();

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

  // 2. Initialize Workflow Registry & Engine
  const registry = new WorkflowRegistry();
  const wTelemetry = new WorkflowTelemetry(persistence);
  const engine = new WorkflowEngine(registry, wTelemetry, orchestrator, approval);

  // Register the 4 standard templates
  registry.registerTemplate(new BrowserResearchWorkflowTemplate());
  registry.registerTemplate(new LocalCloudProvisioningTemplate());
  registry.registerTemplate(new DocumentProcessingTemplate());
  registry.registerTemplate(new SpecToExecutionTemplate());

  console.log("[BOOT] Registered 4 standard operational templates:");
  console.log("  - Governed Browser Research Workflow");
  console.log("  - Local Cloud Provisioning Workflow");
  console.log("  - Document Processing Workflow");
  console.log("  - Spec-to-Execution Workflow");

  // 3. Boot Unified Orchestrator Core
  const activeServices = await orchestrator.start();
  console.log(`[BOOT] Active orchestration services loaded successfully: ${activeServices.join(", ")}`);

  console.log("\n\x1b[32m[SHOWCASE] Running Governed Browser Research Showcase Workflow Demo...\x1b[0m");

  // Instantiate showcase template
  const browserTemplate = registry.getTemplate("browser-research-template")!;

  // Safe run with normal limit quota (no approval needed)
  console.log("[SHOWCASE] 1. Instantiating SAFE Workflow (quota: 5000 bytes)...");
  const safeWorkflow = browserTemplate.createWorkflow({ id: "showcase-safe-research", limitBytes: 5000 });
  registry.registerWorkflow(safeWorkflow);

  console.log("[SHOWCASE] Executing SAFE Workflow...");
  const safeExecResult = await engine.executeWorkflow("showcase-safe-research", "exec-safe-demo");
  console.log(`[SHOWCASE] SAFE Workflow finished with status: \x1b[32m${safeExecResult.status}\x1b[0m`);

  // Unsafe run with illegal paths (blocked under governance constraints decider)
  console.log("\n[SHOWCASE] 2. Instantiating ILLEGAL Workflow (contains path traversal attempt)...");
  const illegalWorkflow = browserTemplate.createWorkflow({ id: "showcase-illegal-research" });
  illegalWorkflow.tasks[0].id = "task-passwd";
  illegalWorkflow.tasks[0].description = "Attempt reading file:///etc/passwd inside sandbox";
  registry.registerWorkflow(illegalWorkflow);

  console.log("[SHOWCASE] Executing ILLEGAL Workflow...");
  const illegalExecResult = await engine.executeWorkflow("showcase-illegal-research", "exec-illegal-demo");
  console.log(
    `[SHOWCASE] ILLEGAL Workflow execution blocked: status = \x1b[31m${illegalExecResult.status}\x1b[0m, reason = "${illegalExecResult.error}"`
  );

  // Approval run with large quota (triggers manual governance gate approval)
  console.log(
    "\n[SHOWCASE] 3. Instantiating SECURE Workflow (quota: 25000 bytes, triggers approval policy decider)..."
  );
  const approvalWorkflow = browserTemplate.createWorkflow({ id: "showcase-approval-research", limitBytes: 25000 });
  registry.registerWorkflow(approvalWorkflow);

  console.log("[SHOWCASE] Executing SECURE Workflow...");
  const approvalExecResult = await engine.executeWorkflow("showcase-approval-research", "exec-approval-demo");
  console.log(
    `[SHOWCASE] SECURE Workflow held in: status = \x1b[33m${approvalExecResult.status}\x1b[0m, approved = ${approvalExecResult.approved}`
  );

  const pendingApprovals = await approval.listRecords();
  console.log(`[SHOWCASE] Governance Registry pending approval records found:`, pendingApprovals);

  const targetApproval = pendingApprovals.find((r) => r.taskId === "exec-approval-demo")!;
  console.log(`[SHOWCASE] Approving pending governance token request [${targetApproval.approvalId}]...`);

  const approvedResult = await engine.approveAndTriggerWorkflow(targetApproval.approvalId);
  console.log(
    `[SHOWCASE] SECURE Workflow execution completed after approval: status = \x1b[32m${approvedResult.status}\x1b[0m`
  );

  console.log("\n\x1b[35m===============================================================================");
  console.log("   GHOSTSTACK BOOTSTRAP DEMONSTRATION COMPLETE - ALL SYSTEMS RUNNING SAFELY");
  console.log("===============================================================================\x1b[0m\n");
}

bootstrap().catch((err) => {
  console.error("[CRITICAL] Bootstrap runtime crashed:", err);
  process.exit(1);
});
