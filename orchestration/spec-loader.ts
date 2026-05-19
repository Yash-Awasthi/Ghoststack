import * as fs from "fs";
import * as path from "path";
import { Task } from "./task-router";
import { IWorkflowDefinition } from "./interfaces/workflow.interface";

export interface WorkflowSpecTask {
  id: string;
  title: string;
  description: string;
  type: string;
  action: string;
  priority: string;
  arguments?: Record<string, unknown>;
  dependencies: string[];
}

export interface WorkflowSpecFile {
  spec_version: string;
  metadata: {
    name: string;
    description?: string;
    author?: string;
    created_at?: string;
  };
  template_id: string;
  variables?: Record<string, unknown>;
  tasks: WorkflowSpecTask[];
}

export function parseWorkflowSpec(raw: string, sourceLabel: string): WorkflowSpecFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid workflow spec JSON (${sourceLabel}): ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Workflow spec must be a JSON object (${sourceLabel})`);
  }
  const spec = parsed as WorkflowSpecFile;
  if (!spec.template_id || !Array.isArray(spec.tasks) || spec.tasks.length === 0) {
    throw new Error(`Workflow spec missing template_id or tasks (${sourceLabel})`);
  }
  if (!spec.metadata?.name) {
    throw new Error(`Workflow spec missing metadata.name (${sourceLabel})`);
  }
  return spec;
}

export function specToWorkflowDefinition(spec: WorkflowSpecFile, workflowId: string): IWorkflowDefinition {
  const tasks: Task[] = spec.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: "pending",
    dependencies: t.dependencies ?? [],
    type: t.type,
    action: t.action,
    arguments: t.arguments
  }));

  return {
    id: workflowId,
    name: spec.metadata.name,
    description: spec.metadata.description ?? "",
    tasks
  };
}

export function loadWorkflowSpecFile(filePath: string): WorkflowSpecFile {
  const raw = fs.readFileSync(filePath, "utf8");
  return parseWorkflowSpec(raw, filePath);
}

/** Recursively load `workflow-spec.json` files under a specs directory. */
export function loadWorkflowSpecsFromDir(specsDir: string): { filePath: string; spec: WorkflowSpecFile }[] {
  if (!fs.existsSync(specsDir)) {
    return [];
  }

  const results: { filePath: string; spec: WorkflowSpecFile }[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name === "workflow-spec.json") {
        results.push({ filePath: full, spec: loadWorkflowSpecFile(full) });
      }
    }
  };

  walk(specsDir);
  return results;
}
