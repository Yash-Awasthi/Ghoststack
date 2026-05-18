import { IRuntimeInspector } from './interfaces/observability.interface';

export class RuntimeDiagnosticAPI {
  private inspector: IRuntimeInspector;

  constructor(inspector: IRuntimeInspector) {
    this.inspector = inspector;
  }

  async handle(method: string, path: string): Promise<any> {
    if (method !== 'GET') {
      throw new Error(`Unsupported method: ${method}`);
    }

    switch (path) {
      case '/health':
        return this.inspector.getHealth();
      case '/metrics':
        return this.inspector.getMetrics();
      case '/runtime/state':
        return this.inspector.getSnapshots();
      case '/runtime/tasks':
        return this.inspector.getTasks();
      case '/runtime/events':
        return this.inspector.getEvents();
      case '/runtime/queues':
        return this.inspector.getQueues();
      case '/runtime/services':
        return this.inspector.getServices();
      case '/runtime/snapshots':
        return this.inspector.getSnapshots();
      default:
        throw new Error(`Not Found: ${path}`);
    }
  }
}
