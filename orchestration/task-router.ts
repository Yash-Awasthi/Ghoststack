import { IEventBus } from './event-bus';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  dependencies: string[];
}

export class TaskRouter {
  private bus: IEventBus;
  private queue: Task[] = [];

  constructor(bus: IEventBus) {
    this.bus = bus;
  }

  async route(task: Task): Promise<Task> {
    task.status = "routed";
    this.queue.push(task);
    await this.bus.publish('task_routed', task);
    return task;
  }

  getQueue(): Task[] {
    return this.queue;
  }
}
