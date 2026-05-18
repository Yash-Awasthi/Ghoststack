import { LocalServiceDiscovery, HealthMonitor } from '../orchestration/service-discovery';
import { IConfigLoader } from '../runtime/config-loader';

describe("Milestone 3: Service Discovery & Health Monitoring", () => {
  it("should register dynamic services and update statuses dynamically", async () => {
    const discovery = new LocalServiceDiscovery();

    await discovery.registerService("floci", 4566, { type: "docker" });
    const list = await discovery.listServices();
    
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("floci");
    expect(list[0].status).toBe("healthy");

    await discovery.registerService("floci", 4566, { type: "docker", status: "offline" });
    const floci = await discovery.getService("floci");
    expect(floci?.status).toBe("offline");
  });

  it("should monitor config services and evaluate dynamic checks", async () => {
    const discovery = new LocalServiceDiscovery();
    
    // Mock Config Loader
    const mockLoader: IConfigLoader = {
      loadPorts: jest.fn(),
      loadServices: jest.fn().mockResolvedValue({
        services: {
          floci: { type: "docker", port: 4566 },
          fcc: { type: "process", port: 8082 }
        }
      }),
      loadHealthchecks: jest.fn().mockResolvedValue({
        healthchecks: {
          floci: { path: "/health", interval: 1000 }
        }
      }),
      loadRuntime: jest.fn()
    };

    const monitor = new HealthMonitor(mockLoader, discovery);
    await monitor.startMonitoring();

    const services = await discovery.listServices();
    expect(services.length).toBe(2);
    expect(services.map(s => s.name)).toContain("floci");
    expect(services.map(s => s.name)).toContain("fcc");

    await monitor.stopMonitoring();
  });
});
