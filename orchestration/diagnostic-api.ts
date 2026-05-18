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
      case '/runtime/mcp':
        return (this.inspector as any).getMCPSummary ? (this.inspector as any).getMCPSummary() : {};
      case '/runtime/mcp/servers':
        return (this.inspector as any).getMCPServers ? (this.inspector as any).getMCPServers() : [];
      case '/runtime/mcp/tools':
        return (this.inspector as any).getMCPTools ? (this.inspector as any).getMCPTools() : [];
      case '/runtime/mcp/executions':
        return (this.inspector as any).getMCPExecutions ? (this.inspector as any).getMCPExecutions() : [];
      default:
        throw new Error(`Not Found: ${path}`);
    }
  }
}
