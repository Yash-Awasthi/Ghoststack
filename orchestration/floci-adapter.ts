import { IExecutionAdapter, IExecutionContext } from "./interfaces/execution.interface";

export class FlociExecutionAdapter implements IExecutionAdapter {
  private endpoint = "http://localhost:4566";

  canExecute(taskType: string): boolean {
    return taskType === "floci";
  }

  async execute(task: any, context: IExecutionContext): Promise<any> {
    const payload = task.payload || {};
    const action = payload.action;

    context.logger?.info?.(`Floci adapter dispatching action: ${action}`, { taskId: context.taskId });

    if (action === "create_s3_bucket") {
      const bucketName = payload.bucketName;
      if (!bucketName) throw new Error("Missing bucketName in create_s3_bucket payload");

      try {
        const response = await fetch(`${this.endpoint}/${bucketName}`, {
          method: "PUT"
        });
        if (response.ok) {
          return {
            status: "success",
            service: "s3",
            bucketName,
            bucketUrl: `${this.endpoint}/${bucketName}`
          };
        }
      } catch (err) {
        context.logger?.warn?.(`Floci S3 endpoint connection refused. Falling back to local offline mock.`, {
          error: err
        });
      }

      return {
        status: "success",
        service: "s3",
        bucketName,
        bucketUrl: `${this.endpoint}/${bucketName}`,
        mocked: true
      };
    }

    if (action === "create_sqs_queue") {
      const queueName = payload.queueName;
      if (!queueName) throw new Error("Missing queueName in create_sqs_queue payload");

      try {
        const params = new URLSearchParams({
          Action: "CreateQueue",
          QueueName: queueName,
          Version: "2012-11-05"
        });
        const response = await fetch(`${this.endpoint}/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: params.toString()
        });
        if (response.ok) {
          return {
            status: "success",
            service: "sqs",
            queueName,
            queueUrl: `${this.endpoint}/000000000000/${queueName}`
          };
        }
      } catch (err) {
        context.logger?.warn?.(`Floci SQS endpoint connection refused. Falling back to local offline mock.`, {
          error: err
        });
      }

      return {
        status: "success",
        service: "sqs",
        queueName,
        queueUrl: `${this.endpoint}/000000000000/${queueName}`,
        mocked: true
      };
    }

    if (action === "create_dynamodb_table") {
      const tableName = payload.tableName;
      if (!tableName) throw new Error("Missing tableName in create_dynamodb_table payload");

      try {
        const ddbPayload = {
          TableName: tableName,
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
        };
        const response = await fetch(`${this.endpoint}/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-amz-json-1.0",
            "X-Amz-Target": "DynamoDB_20120810.CreateTable"
          },
          body: JSON.stringify(ddbPayload)
        });
        if (response.ok) {
          return {
            status: "success",
            service: "dynamodb",
            tableName
          };
        }
      } catch (err) {
        context.logger?.warn?.(`Floci DynamoDB endpoint connection refused. Falling back to local offline mock.`, {
          error: err
        });
      }

      return {
        status: "success",
        service: "dynamodb",
        tableName,
        mocked: true
      };
    }

    throw new Error(`Unsupported Floci action: ${action}`);
  }
}
