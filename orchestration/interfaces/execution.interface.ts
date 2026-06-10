import { ILogger } from "./logger.interface";

export interface IExecutionContext {
  taskId: string;
  startTime: Date;
  attempt: number;
  environment: Record<string, string>;
  /** Typed logger — replaces the previous `any` */
  logger: ILogger;
}

export interface IRuntimeEvent {
  eventId: string;
  taskId: string;
  type: "execution_started" | "execution_succeeded" | "execution_failed";
  timestamp: Date;
  /** Untyped at interface boundary — implementations narrow as needed */
  payload: unknown;
}

// Adapter boundary: tasks are heterogeneous across adapters (floci, browser, scraping).
// Using unknown + narrowing in implementations is the correct pattern here.
export interface IExecutionAdapter {
  canExecute(taskType: string): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute(task: any, context: IExecutionContext): Promise<any>;
}

export interface ITaskDependencyResolver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolveOrder(tasks: any[]): any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detectCycles(tasks: any[]): boolean;
}

export interface ITaskExecutor {
  start(): Promise<void>;
  executeNext(): Promise<boolean>;
  runLoop(maxIterations?: number, idleDelayMs?: number): Promise<number>;
}
