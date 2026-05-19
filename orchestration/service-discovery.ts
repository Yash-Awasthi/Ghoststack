import { IServiceDiscovery, ServiceHeartbeat, IHealthMonitor } from "./interfaces/discovery.interface";
import { IConfigLoader } from "../runtime/config-loader";
import { probeFlociHealth, resolveFlociEndpoint } from "./floci-client";

export class LocalServiceDiscovery implements IServiceDiscovery {
  private services = new Map<string, ServiceHeartbeat>();

  async registerService(name: string, port: number, details?: any): Promise<void> {
    const status = details?.status || "healthy";
    this.services.set(name, {
      name,
      status,
      lastCheck: new Date(),
      details: { ...details, port }
    });
  }

  async deregisterService(name: string): Promise<void> {
    this.services.delete(name);
  }

  async getService(name: string): Promise<ServiceHeartbeat | undefined> {
    return this.services.get(name);
  }

  async listServices(): Promise<ServiceHeartbeat[]> {
    return Array.from(this.services.values());
  }
}

export class HealthMonitor implements IHealthMonitor {
  private configLoader: IConfigLoader;
  private discovery: IServiceDiscovery;
  private timer: NodeJS.Timeout | null = null;

  constructor(configLoader: IConfigLoader, discovery: IServiceDiscovery) {
    this.configLoader = configLoader;
    this.discovery = discovery;
  }

  async startMonitoring(): Promise<void> {
    await this.pollChecks();
    this.timer = setInterval(() => {
      this.pollChecks().catch((err) => {
        console.error("Health monitor loop failure:", err);
      });
    }, 5000);
  }

  async stopMonitoring(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async checkService(name: string): Promise<boolean> {
    const service = await this.discovery.getService(name);
    return service?.status === "healthy";
  }

  private async pollChecks(): Promise<void> {
    try {
      const servicesConfig = await this.configLoader.loadServices();
      const healthConfig = await this.configLoader.loadHealthchecks();
      const services = Object.keys(servicesConfig?.services || {});

      for (const serviceName of services) {
        const def = servicesConfig.services[serviceName];
        const hc = healthConfig?.healthchecks?.[serviceName];
        let status: "healthy" | "degraded" | "offline" = "healthy";
        let probeLatencyMs: number | undefined;

        if (serviceName === "floci") {
          const probe = await probeFlociHealth(resolveFlociEndpoint());
          probeLatencyMs = probe.latencyMs;
          status = probe.reachable ? "healthy" : "offline";
        } else if (hc?.path && def?.port) {
          const base = `http://127.0.0.1:${def.port}`;
          try {
            const res = await fetch(`${base}${hc.path}`, {
              method: "GET",
              signal: AbortSignal.timeout(3000)
            });
            status = res.ok ? "healthy" : "degraded";
          } catch {
            status = "offline";
          }
        }

        await this.discovery.registerService(serviceName, def.port, {
          type: def.type,
          status,
          healthPath: hc?.path,
          probeLatencyMs
        });
      }
    } catch (e) {
      console.error("Error in healthcheck polling:", e);
    }
  }
}
