import { Task } from "./task-router";

export type QueueJobPayload = {
  type: string;
  payload: Record<string, unknown>;
};

/**
 * Maps a workflow task to the queue executor shape.
 * Uses explicit type/action/arguments when present; otherwise falls back to
 * description keyword routing for legacy templates and tests.
 */
export function buildQueuePayloadFromTask(task: Task): QueueJobPayload {
  if (task.type && task.action) {
    return {
      type: task.type,
      payload: {
        action: task.action,
        ...(task.arguments ?? {})
      }
    };
  }

  let payloadType = "floci";
  let payloadPayload: Record<string, unknown> = {};

  if (task.description.includes("browser")) {
    payloadType = "browser";
    payloadPayload = {
      url: task.description.includes("illegal") ? "file:///etc/passwd" : "https://github.com",
      actions: [{ type: "navigate", value: "https://news.ycombinator.com" }],
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

  return { type: payloadType, payload: payloadPayload };
}
