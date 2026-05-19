import { IMCPTransport } from "./interfaces/mcp.interface";
import type { GhostStackRuntimeContext } from "../runtime/runtime-context";
import { FlociExecutionAdapter } from "./floci-adapter";
import { resolveSandboxPath } from "./runtime-sandbox";
import { loadWorkflowSpecFile, specToWorkflowDefinition } from "./spec-loader";
import { runFederationE2e } from "../runtime/e2e-federation";
import { MCPServerRegistry } from "./mcp-registry";
import { MCPRuntime } from "./mcp-adapter";
import * as fs from "fs";
import * as path from "path";

/**
 * In-process MCP transport exposing GhostStack orchestrator capabilities.
 */
export class GhostStackMcpBridge implements IMCPTransport {
  private connected = false;

  constructor(private readonly ctx: GhostStackRuntimeContext) {}

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async send(message: { method: string; params?: Record<string, unknown> }): Promise<unknown> {
    if (!this.connected) {
      throw new Error("GhostStack MCP bridge not connected");
    }

    if (message.method !== "tools/call") {
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, method: message.method }) }] };
    }

    const name = message.params?.name as string;
    const args = (message.params?.arguments as Record<string, unknown>) ?? {};
    const text = await this.dispatchTool(name, args);
    return { content: [{ type: "text", text }] };
  }

  private async dispatchTool(name: string, args: Record<string, unknown>): Promise<string> {
    switch (name) {
      case "ghoststack_health": {
        const floci = await this.ctx.flociAdapter.probeHealth();
        const agg = await this.ctx.inspector.getHealth();
        return JSON.stringify({ orchestrator: agg, floci }, null, 2);
      }
      case "ghoststack_runtime_snapshot": {
        const snap = await this.ctx.inspector.getSnapshots();
        return JSON.stringify(snap, null, 2);
      }
      case "ghoststack_list_workflows": {
        const list = this.ctx.registry.listWorkflows().map((w) => ({
          id: w.id,
          name: w.name,
          tasks: w.tasks.length
        }));
        return JSON.stringify(list, null, 2);
      }
      case "ghoststack_load_spec": {
        const specPath = args.specPath as string;
        if (!specPath) throw new Error("specPath is required (e.g. specs/demo-etl/workflow-spec.json)");
        const full = path.isAbsolute(specPath)
          ? specPath
          : path.join(this.ctx.repoRoot, specPath);
        const spec = loadWorkflowSpecFile(full);
        const workflowId = (args.workflowId as string) || path.basename(path.dirname(full));
        const def = specToWorkflowDefinition(spec, workflowId);
        this.ctx.registry.registerWorkflow(def);
        return JSON.stringify({ loaded: workflowId, tasks: def.tasks.length, templateId: spec.template_id }, null, 2);
      }
      case "ghoststack_execute_workflow": {
        const workflowId = args.workflowId as string;
        const executionId = (args.executionId as string) || `mcp-exec-${Date.now()}`;
        if (!workflowId) throw new Error("workflowId is required");
        const result = await this.ctx.workflowEngine.executeWorkflow(workflowId, executionId);
        return JSON.stringify(result, null, 2);
      }
      case "ghoststack_run_e2e": {
        const result = await runFederationE2e(this.ctx, {
          strict: args.strict !== false,
          cleanup: args.cleanup !== false
        });
        return JSON.stringify(result, null, 2);
      }
      case "ghoststack_floci_execute": {
        const action = args.action as string;
        if (!action) throw new Error("action is required");
        const { action: _a, ...rest } = args;
        const adapter = this.ctx.flociAdapter as FlociExecutionAdapter;
        const result = await adapter.executeAction(action, rest, {
          taskId: `mcp-floci-${Date.now()}`,
          startTime: new Date(),
          attempt: 1,
          environment: {},
          logger: this.ctx.logger
        });
        return JSON.stringify(result, null, 2);
      }
      case "ghoststack_sandbox_write": {
        const relPath = args.path as string;
        const content = (args.content as string) ?? "";
        if (!relPath) throw new Error("path is required");
        const target = resolveSandboxPath(this.ctx.sandbox.workspacesDir, this.ctx.sandbox.root, relPath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, "utf8");
        return JSON.stringify({ written: target, bytes: Buffer.byteLength(content) }, null, 2);
      }
      case "ghoststack_sandbox_read": {
        const relPath = args.path as string;
        if (!relPath) throw new Error("path is required");
        const target = resolveSandboxPath(this.ctx.sandbox.workspacesDir, this.ctx.sandbox.root, relPath);
        const content = fs.readFileSync(target, "utf8");
        return JSON.stringify({ path: target, content }, null, 2);
      }
      case "ghoststack_sandbox_list": {
        const relDir = (args.path as string) || ".";
        const target = resolveSandboxPath(this.ctx.sandbox.workspacesDir, this.ctx.sandbox.root, relDir);
        const entries = fs.readdirSync(target, { withFileTypes: true }).map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "dir" : "file"
        }));
        return JSON.stringify({ path: target, entries }, null, 2);
      }
      default:
        throw new Error(`Unknown GhostStack MCP tool: ${name}`);
    }
  }
}

export async function registerGhostStackMcpBridge(ctx: GhostStackRuntimeContext): Promise<{
  registry: MCPServerRegistry;
  runtime: MCPRuntime;
}> {
  const registry = new MCPServerRegistry();
  const transport = new GhostStackMcpBridge(ctx);
  await registry.registerServer(
    {
      name: "ghoststack",
      transportType: "stdio",
      endpoint: "in-process",
      status: "active",
      tools: [...GHOSTSTACK_MCP_TOOLS]
    },
    transport
  );
  const runtime = new MCPRuntime(registry, ctx.metrics, ctx.tracer);
  return { registry, runtime };
}

export const GHOSTSTACK_MCP_TOOLS = [
  "ghoststack_health",
  "ghoststack_runtime_snapshot",
  "ghoststack_list_workflows",
  "ghoststack_load_spec",
  "ghoststack_execute_workflow",
  "ghoststack_run_e2e",
  "ghoststack_floci_execute",
  "ghoststack_sandbox_write",
  "ghoststack_sandbox_read",
  "ghoststack_sandbox_list"
];
