import { IPlanningEngine, ICognitiveTrace, ITaskSynthesisResult } from "./interfaces/governance.interface";

export class PlanningEngine implements IPlanningEngine {
  async generatePlan(objective: string, _context?: any): Promise<ICognitiveTrace> {
    const planId = `plan-${Math.floor(1000 + Math.random() * 9000)}`;
    const synthesisResults: ITaskSynthesisResult[] = [];

    const normObj = objective.toLowerCase();

    if (normObj.includes("ingestion") || normObj.includes("scraper")) {
      // Decompose ingestion deployment objective into topological graph
      synthesisResults.push({
        taskId: `${planId}-s3-bucket`,
        action: "create_s3_bucket",
        arguments: { bucketName: "news-scraper-archive", encrypted: true },
        dependencies: [],
        priority: "high",
        governanceMetadata: { dangerous: false, costEstimate: 0.02, resourceScope: "aws:s3" }
      });

      synthesisResults.push({
        taskId: `${planId}-sqs-queue`,
        action: "create_sqs_queue",
        arguments: { queueName: "news-ingestion-jobs" },
        dependencies: [`${planId}-s3-bucket`],
        priority: "medium",
        governanceMetadata: { dangerous: false, costEstimate: 0.01, resourceScope: "aws:sqs" }
      });

      synthesisResults.push({
        taskId: `${planId}-ddb-table`,
        action: "create_dynamodb_table",
        arguments: { tableName: "scraper-headlines", primaryKey: "id" },
        dependencies: [`${planId}-sqs-queue`],
        priority: "medium",
        governanceMetadata: { dangerous: false, costEstimate: 0.05, resourceScope: "aws:dynamodb" }
      });
    } else if (normObj.includes("backup") || normObj.includes("secure")) {
      // Decompose secure backup objective
      synthesisResults.push({
        taskId: `${planId}-iam-role`,
        action: "create_iam_role",
        arguments: { roleName: "BackupAdministrator", permissions: ["*"] },
        dependencies: [],
        priority: "high",
        governanceMetadata: { dangerous: true, costEstimate: 0.0, resourceScope: "aws:iam" }
      });

      synthesisResults.push({
        taskId: `${planId}-archive-s3`,
        action: "create_s3_bucket",
        arguments: { bucketName: "secure-backups-archive" },
        dependencies: [`${planId}-iam-role`],
        priority: "high",
        governanceMetadata: { dangerous: false, costEstimate: 0.1, resourceScope: "aws:s3" }
      });
    } else if (normObj.includes("dangerous") || normObj.includes("delete")) {
      // Dangerous cleanup objective
      synthesisResults.push({
        taskId: `${planId}-cleanup-wildcard`,
        action: "delete_all_resources",
        arguments: { scope: "*" },
        dependencies: [],
        priority: "high",
        governanceMetadata: { dangerous: true, costEstimate: 0.0, resourceScope: "system:root" }
      });
    } else {
      // Fallback single task
      synthesisResults.push({
        taskId: `${planId}-generic-task`,
        action: "generic_execution",
        arguments: { objective },
        dependencies: [],
        priority: "medium",
        governanceMetadata: { dangerous: false, costEstimate: 0.01, resourceScope: "generic" }
      });
    }

    return {
      planId,
      objective,
      synthesisResults,
      timestamp: new Date()
    };
  }
}
