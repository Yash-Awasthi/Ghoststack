import { Task } from './task-router';
import {
  IWorkflowDefinition,
  IWorkflowExecution,
  IWorkflowTemplate,
  IWorkflowRegistry,
  IWorkflowTelemetry,
  IWorkflowReplay,
  IWorkflowApprovalPolicy,
  IWorkflowConstraint
} from './interfaces/workflow.interface';
import { GhostStackOrchestrator } from '../runtime/orchestrator';
import { IRuntimePersistence } from './interfaces/persistence.interface';
import { IApprovalWorkflow } from './interfaces/governance.interface';

// 1. Generic Workflow Constraint Implementation
export class WorkflowConstraint implements IWorkflowConstraint {
  constructor(public name: string, private checker: (tasks: Task[]) => Promise<{ allowed: boolean; reason?: string }>) {}
  async evaluate(tasks: Task[]): Promise<{ allowed: boolean; reason?: string }> {
    return this.checker(tasks);
  }
}

// 2. Generic Workflow Approval Policy Implementation
export class WorkflowApprovalPolicy implements IWorkflowApprovalPolicy {
  constructor(public workflowName: string, private decider: (tasks: Task[]) => Promise<boolean>) {}
  async requiresApproval(tasks: Task[]): Promise<boolean> {
    return this.decider(tasks);
  }
}

// 3. Workflow Registry Implementation
export class WorkflowRegistry implements IWorkflowRegistry {
  private templates = new Map<string, IWorkflowTemplate>();
  private definitions = new Map<string, IWorkflowDefinition>();

  registerTemplate(template: IWorkflowTemplate): void {
    this.templates.set(template.templateId, template);
  }

  getTemplate(templateId: string): IWorkflowTemplate | undefined {
    return this.templates.get(templateId);
  }

  listTemplates(): IWorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  registerWorkflow(definition: IWorkflowDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  getWorkflow(workflowId: string): IWorkflowDefinition | undefined {
    return this.definitions.get(workflowId);
  }

  listWorkflows(): IWorkflowDefinition[] {
    return Array.from(this.definitions.values());
  }
}

// 4. Workflow Telemetry Implementation
export class WorkflowTelemetry implements IWorkflowTelemetry {
  private persistence?: IRuntimePersistence;
  private memoryLogs: IWorkflowExecution[] = [];

  constructor(persistence?: IRuntimePersistence) {
    this.persistence = persistence;
    this.loadFromPersistence();
  }

  private async loadFromPersistence() {
    if (this.persistence) {
      const history = await this.persistence.getState<IWorkflowExecution[]>("workflow_history");
      if (history) {
        this.memoryLogs = history;
      }
    }
  }

  private async sync() {
    if (this.persistence) {
      await this.persistence.saveState("workflow_history", this.memoryLogs);
    }
  }

  recordExecutionStart(executionId: string, workflowId: string): void {
    const existing = this.memoryLogs.find(e => e.id === executionId);
    if (!existing) {
      this.memoryLogs.push({
        id: executionId,
        workflowId,
        status: 'pending',
        taskResults: {},
        startedAt: new Date()
      });
      this.sync();
    }
  }

  recordExecutionSuccess(executionId: string, results: Record<string, any>): void {
    const record = this.memoryLogs.find(e => e.id === executionId);
    if (record) {
      record.status = 'succeeded';
      record.taskResults = results;
      record.completedAt = new Date();
      this.sync();
    }
  }

  recordExecutionFailure(executionId: string, error: string): void {
    const record = this.memoryLogs.find(e => e.id === executionId);
    if (record) {
      record.status = 'failed';
      record.error = error;
      record.completedAt = new Date();
      this.sync();
    }
  }

  recordApprovalDecision(executionId: string, approved: boolean): void {
    const record = this.memoryLogs.find(e => e.id === executionId);
    if (record) {
      record.approved = approved;
      if (!approved) {
        record.status = 'rejected';
      }
      this.sync();
    }
  }

  getExecutionHistory(): IWorkflowExecution[] {
    return [...this.memoryLogs];
  }
}

// 5. Workflow Engine & Replayer Core
export class WorkflowEngine implements IWorkflowReplay {
  constructor(
    private registry: IWorkflowRegistry,
    private telemetry: IWorkflowTelemetry,
    private orchestrator: GhostStackOrchestrator,
    private approvalWorkflow?: IApprovalWorkflow
  ) {}

  async executeWorkflow(workflowId: string, executionId: string): Promise<IWorkflowExecution> {
    const def = this.registry.getWorkflow(workflowId);
    if (!def) {
      throw new Error(`Workflow definition ${workflowId} not found.`);
    }

    this.telemetry.recordExecutionStart(executionId, workflowId);

    // 1. Evaluate Governance Constraints
    if (def.constraints) {
      for (const constraint of def.constraints) {
        const check = await constraint.evaluate(def.tasks);
        if (!check.allowed) {
          const reason = check.reason || `Blocked by constraint: ${constraint.name}`;
          this.telemetry.recordExecutionFailure(executionId, reason);
          return {
            id: executionId,
            workflowId,
            status: 'failed',
            taskResults: {},
            startedAt: new Date(),
            completedAt: new Date(),
            error: reason
          };
        }
      }
    }

    // 2. Process Approval Gates
    let needsApproval = false;
    if (def.approvalPolicy) {
      needsApproval = await def.approvalPolicy.requiresApproval(def.tasks);
    }

    if (needsApproval) {
      this.telemetry.recordApprovalDecision(executionId, false);
      if (this.approvalWorkflow) {
        // Queue approval token request
        await this.approvalWorkflow.createRequest(executionId);
      }
      return {
        id: executionId,
        workflowId,
        status: 'pending',
        taskResults: {},
        startedAt: new Date(),
        approved: false
      };
    }

    // Mark as approved (default when no approval is required or passed)
    this.telemetry.recordApprovalDecision(executionId, true);

    // 3. Submit and Drive Execution using GhostStack Orchestrator
    try {
      await this.orchestrator.submitAndExecuteTasks(def.tasks);
      
      const results: Record<string, any> = {};
      for (const t of def.tasks) {
        results[t.id] = { status: "completed" };
      }

      this.telemetry.recordExecutionSuccess(executionId, results);
      return {
        id: executionId,
        workflowId,
        status: 'succeeded',
        taskResults: results,
        startedAt: new Date(),
        completedAt: new Date(),
        approved: true
      };
    } catch (e: any) {
      const errorMsg = e.message || String(e);
      this.telemetry.recordExecutionFailure(executionId, errorMsg);
      return {
        id: executionId,
        workflowId,
        status: 'failed',
        taskResults: {},
        startedAt: new Date(),
        completedAt: new Date(),
        approved: true,
        error: errorMsg
      };
    }
  }

  async approveAndTriggerWorkflow(approvalId: string): Promise<IWorkflowExecution> {
    let executionId = approvalId;
    if (this.approvalWorkflow) {
      const record = await this.approvalWorkflow.getRecord(approvalId);
      if (record) {
        executionId = record.taskId;
        await this.approvalWorkflow.approve(approvalId, "Admin approved Phase 8 workflow execution");
      }
    }

    const history = this.telemetry.getExecutionHistory();
    const record = history.find(h => h.id === executionId);
    if (!record) {
      throw new Error(`Execution record ${executionId} not found.`);
    }

    this.telemetry.recordApprovalDecision(executionId, true);

    const def = this.registry.getWorkflow(record.workflowId);
    if (!def) {
      throw new Error(`Workflow definition ${record.workflowId} not found.`);
    }

    try {
      await this.orchestrator.submitAndExecuteTasks(def.tasks);
      
      const results: Record<string, any> = {};
      for (const t of def.tasks) {
        results[t.id] = { status: "completed" };
      }

      this.telemetry.recordExecutionSuccess(executionId, results);
      return {
        id: executionId,
        workflowId: record.workflowId,
        status: 'succeeded',
        taskResults: results,
        startedAt: record.startedAt,
        completedAt: new Date(),
        approved: true
      };
    } catch (e: any) {
      const errorMsg = e.message || String(e);
      this.telemetry.recordExecutionFailure(executionId, errorMsg);
      return {
        id: executionId,
        workflowId: record.workflowId,
        status: 'failed',
        taskResults: {},
        startedAt: record.startedAt,
        completedAt: new Date(),
        approved: true,
        error: errorMsg
      };
    }
  }

  async replayExecution(executionId: string): Promise<IWorkflowExecution> {
    const history = this.telemetry.getExecutionHistory();
    const record = history.find(h => h.id === executionId);
    if (!record) {
      throw new Error(`Execution record ${executionId} not found to replay.`);
    }

    // Reset status to rerun
    return this.executeWorkflow(record.workflowId, `${executionId}-replay-${Date.now()}`);
  }
}

// 6. Workflow Templates Definitions for required 4 verticals

export class BrowserResearchWorkflowTemplate implements IWorkflowTemplate {
  templateId = "browser-research-template";
  name = "Governed Browser Research Workflow";
  description = "Coordinates research with navigation caps, scraping tasks, and approval gates.";

  createWorkflow(params: Record<string, any>): IWorkflowDefinition {
    const limitBytes = params.limitBytes || 5000;
    return {
      id: params.id || "browser-research-wf",
      name: this.name,
      description: this.description,
      tasks: [
        {
          id: `${params.id || "browser-research-wf"}-nav-task`,
          title: "Browser Navigation step",
          description: `browser navigate task with quota limit ${limitBytes}`,
          priority: "high",
          status: "pending",
          dependencies: []
        },
        {
          id: `${params.id || "browser-research-wf"}-scrape-task`,
          title: "Headlines Scraping step",
          description: "scraping research headlines information",
          priority: "medium",
          status: "pending",
          dependencies: [`${params.id || "browser-research-wf"}-nav-task`]
        }
      ],
      approvalPolicy: new WorkflowApprovalPolicy(this.name, async (tasks) => {
        // Enforce approval if browser requests bypass secure sites or use large quotas
        return limitBytes > 10000;
      }),
      constraints: [
        new WorkflowConstraint("Path Restriction Gate", async (tasks) => {
          const hasIllegalPaths = tasks.some(t => t.description.includes("illegal") || t.id.includes("passwd"));
          return { allowed: !hasIllegalPaths, reason: hasIllegalPaths ? "Illegal system file path protocol blocked" : undefined };
        })
      ]
    };
  }
}

export class LocalCloudProvisioningTemplate implements IWorkflowTemplate {
  templateId = "cloud-provisioning-template";
  name = "Local Cloud Provisioning Workflow";
  description = "Ingests multi-resource configs, sorting topological floci task chains.";

  createWorkflow(params: Record<string, any>): IWorkflowDefinition {
    const prefix = params.id || "cloud-prov";
    return {
      id: prefix,
      name: this.name,
      description: this.description,
      tasks: [
        {
          id: `${prefix}-s3-bucket`,
          title: "Create S3 Storage",
          description: "floci create bucket action",
          priority: "high",
          status: "pending",
          dependencies: []
        },
        {
          id: `${prefix}-sqs-queue`,
          title: "Create Messaging Queue",
          description: "floci create queue action",
          priority: "medium",
          status: "pending",
          dependencies: [`${prefix}-s3-bucket`]
        },
        {
          id: `${prefix}-ddb-table`,
          title: "Create Table Substrate",
          description: "floci create dynamodb table action",
          priority: "medium",
          status: "pending",
          dependencies: [`${prefix}-sqs-queue`]
        }
      ]
    };
  }
}

export class DocumentProcessingTemplate implements IWorkflowTemplate {
  templateId = "document-processing-template";
  name = "Document Processing Workflow";
  description = "Performs filesystem sandboxed ingestion, parsing, and formatting.";

  createWorkflow(params: Record<string, any>): IWorkflowDefinition {
    const prefix = params.id || "doc-proc";
    return {
      id: prefix,
      name: this.name,
      description: this.description,
      tasks: [
        {
          id: `${prefix}-filesystem-ingest`,
          title: "Ingest sandbox source files",
          description: "read source configurations files under sandbox root",
          priority: "high",
          status: "pending",
          dependencies: []
        },
        {
          id: `${prefix}-filesystem-format`,
          title: "Structure logs parse",
          description: "format JSON metrics targets to sandboxed output",
          priority: "medium",
          status: "pending",
          dependencies: [`${prefix}-filesystem-ingest`]
        }
      ],
      constraints: [
        new WorkflowConstraint("Sandbox Size Limit Gate", async () => {
          const limitBytes = params.limitBytes || 50000;
          return { allowed: limitBytes < 1000000, reason: limitBytes >= 1000000 ? "Size exceeds sandboxed quota limit" : undefined };
        })
      ]
    };
  }
}

export class SpecToExecutionTemplate implements IWorkflowTemplate {
  templateId = "spec-execution-template";
  name = "Spec-to-Execution Workflow";
  description = "Synthesizes cognitive spec goals, evaluating approvals and execution safety.";

  createWorkflow(params: Record<string, any>): IWorkflowDefinition {
    const prefix = params.id || "spec-exec";
    return {
      id: prefix,
      name: this.name,
      description: this.description,
      tasks: [
        {
          id: `${prefix}-spec-generation`,
          title: "Synthesize Cognitive Specs",
          description: `spec objective generator task: ${params.objective || "deploy s3"}`,
          priority: "high",
          status: "pending",
          dependencies: []
        },
        {
          id: `${prefix}-spec-execution`,
          title: "Orchestrate Governed Synthesis Execution",
          description: "execute target synthesized workflow",
          priority: "medium",
          status: "pending",
          dependencies: [`${prefix}-spec-generation`]
        }
      ],
      approvalPolicy: new WorkflowApprovalPolicy(this.name, async () => {
        // Spec execution always raises safety approvals
        return true;
      })
    };
  }
}
