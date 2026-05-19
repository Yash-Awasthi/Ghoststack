import { FlociExecutionAdapter } from "../orchestration/floci-adapter";
import { IExecutionContext } from "../orchestration/interfaces/execution.interface";

describe("Milestone 2: Floci Client & Execution Adapter", () => {
  const context: IExecutionContext = {
    taskId: "task-01",
    startTime: new Date(),
    attempt: 1,
    environment: {},
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
  };

  it("should match task types matching floci", () => {
    const adapter = new FlociExecutionAdapter();
    expect(adapter.canExecute("floci")).toBe(true);
    expect(adapter.canExecute("process")).toBe(false);
  });

  it("should execute S3 bucket creation action successfully with resilient local fallback", async () => {
    const adapter = new FlociExecutionAdapter();

    const task = {
      type: "floci",
      payload: {
        action: "create_s3_bucket",
        bucketName: "ghoststack-test-bucket"
      }
    };

    const result = await adapter.execute(task, context);
    expect(result.status).toBe("success");
    expect(result.service).toBe("s3");
    expect(result.bucketName).toBe("ghoststack-test-bucket");
    expect(result.bucketUrl).toBe("http://localhost:4566/ghoststack-test-bucket");
  });

  it("should execute SQS queue creation action successfully with resilient local fallback", async () => {
    const adapter = new FlociExecutionAdapter();

    const task = {
      type: "floci",
      payload: {
        action: "create_sqs_queue",
        queueName: "ghoststack-test-queue"
      }
    };

    const result = await adapter.execute(task, context);
    expect(result.status).toBe("success");
    expect(result.service).toBe("sqs");
    expect(result.queueName).toBe("ghoststack-test-queue");
    expect(result.queueUrl).toBe("http://localhost:4566/000000000000/ghoststack-test-queue");
  });

  it("should execute DynamoDB table creation action successfully with resilient local fallback", async () => {
    const adapter = new FlociExecutionAdapter();

    const task = {
      type: "floci",
      payload: {
        action: "create_dynamodb_table",
        tableName: "ghoststack-test-table"
      }
    };

    const result = await adapter.execute(task, context);
    expect(result.status).toBe("success");
    expect(result.service).toBe("dynamodb");
    expect(result.tableName).toBe("ghoststack-test-table");
  });
});
