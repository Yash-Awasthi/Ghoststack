export interface IExecutionContext {
  taskId: string;
  startTime: Date;
  attempt: number;
  environment: Record<string, string>;
  logger: any;
}

export interface IRuntimeEvent {
  eventId: string;
  taskId: string;
  type: "execution_started" | "execution_succeeded" | "execution_failed";
  timestamp: Date;
  payload: any;
}

export interface IExecutionAdapter {
  canExecute(taskType: string): boolean;
  execute(task: any, context: IExecutionContext): Promise<any>;
}

export interface ITaskDependencyResolver {
  resolveOrder(tasks: any[]): any[];
  detectCycles(tasks: any[]): boolean;
}

export interface ITaskExecutor {
  start(): Promise<void>;
  executeNext(): Promise<boolean>;
}
