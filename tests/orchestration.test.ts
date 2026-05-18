import { LocalEventBus } from '../orchestration/event-bus';
import { TaskRouter, Task } from '../orchestration/task-router';
import { LocalAgentRegistry, Agent } from '../orchestration/agent-registry';
import { RuntimeManager } from '../orchestration/runtime-manager';
import { YAMLConfigLoader } from '../runtime/config-loader';
import { GhostStackOrchestrator } from '../runtime/orchestrator';
import * as path from 'path';

describe("Event Bus & Task Routing Pipeline", () => {
  it("should process and route agent tasks with dependency resolution", async () => {
    const bus = new LocalEventBus();
    const router = new TaskRouter(bus);
    
    const task: Task = {
      id: "task-01",
      title: "Scrape Data",
      description: "Extract news feed",
      priority: "high",
      status: "pending",
      dependencies: []
    };
    
    let emittedEvent: Task | null = null;
    bus.subscribe('task_routed', (data) => {
      emittedEvent = data as Task;
    });
    
    const resolved = await router.route(task);
    expect(resolved.status).toBe("routed");
    expect(emittedEvent).not.toBeNull();
    expect(emittedEvent!.id).toBe("task-01");
  });
});

describe("Agent Registry Operations", () => {
  it("should register, retrieve, and filter active agents dynamically", async () => {
    const registry = new LocalAgentRegistry();
    
    const agent: Agent = {
      id: "agent-01",
      name: "codebuff",
      type: "refactor",
      capabilities: ["ts-edit", "lint"],
      status: "idle"
    };
    
    await registry.register(agent);
    
    const retrieved = await registry.getAgent("agent-01");
    expect(retrieved).toEqual(agent);
    
    const listers = await registry.findAgentsByCapability("ts-edit");
    expect(listers.length).toBe(1);
    expect(listers[0].name).toBe("codebuff");
    
    await registry.deregister("agent-01");
    const gone = await registry.getAgent("agent-01");
    expect(gone).toBeUndefined();
  });
});

describe("GhostStack Orchestrator Integration", () => {
  it("should successfully bootstrap and retrieve active services", async () => {
    const loader = new YAMLConfigLoader({
      portsPath: path.join(__dirname, '../runtime/ports.yaml'),
      servicesPath: path.join(__dirname, '../runtime/services.yaml'),
      healthchecksPath: path.join(__dirname, '../runtime/healthchecks.yaml'),
      runtimePath: path.join(__dirname, '../runtime/ghoststack.runtime.yaml'),
    });

    const rm = new RuntimeManager(loader);
    const bus = new LocalEventBus();
    const router = new TaskRouter(bus);
    const registry = new LocalAgentRegistry();

    const orchestrator = new GhostStackOrchestrator(rm, bus, router, registry);
    const activeServices = await orchestrator.start();

    expect(activeServices).toBeDefined();
    expect(activeServices).toContain("floci");
    expect(activeServices).toContain("fcc");
    expect(activeServices).toContain("mcp");
  });
});
