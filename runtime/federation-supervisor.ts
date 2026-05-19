import * as fs from "fs";
import * as path from "path";
import { probeFlociHealth, resolveFlociEndpoint } from "../orchestration/floci-client";
import { loadGhostStackConfig, GhostStackConfig } from "./ghoststack-config";
import { runDockerCompose } from "./docker-compose-runner";
import { createGhostStackServer, GhostStackServer } from "./ghoststack-server";
import { FastMcpHost } from "./adapters/fastmcp-host";

export type FederationServiceStatus = {
  name: string;
  status: "healthy" | "degraded" | "offline" | "skipped";
  detail?: string;
  latencyMs?: number;
};

export type FederationSupervisorStatus = {
  mode: "federation" | "standalone";
  startedAt?: string;
  apiUrl?: string;
  mcpUrl?: string;
  flociUrl?: string;
  weStartedFlociDocker?: boolean;
  services: FederationServiceStatus[];
};

type PersistedState = {
  startedAt: string;
  weStartedFlociDocker: boolean;
  composeFiles: string[];
  apiPort: number;
  mcpPort: number;
};

const COMPOSE_FEDERATION = ["docker/docker-compose.federation.yaml"];

export class FederationSupervisor {
  private readonly repoRoot: string;
  private config: GhostStackConfig;
  private gsServer: GhostStackServer | null = null;
  private mcpHost: FastMcpHost | null = null;
  private weStartedFlociDocker = false;
  private startedAt: string | null = null;

  constructor(repoRoot: string, config?: GhostStackConfig) {
    this.repoRoot = repoRoot;
    this.config = config ?? loadGhostStackConfig(repoRoot);
  }

  static statePath(repoRoot: string): string {
    const dataDir = process.env.GHOSTSTACK_DATA_DIR ?? path.join(repoRoot, "data-runtime");
    return path.join(dataDir, "federation-supervisor-state.json");
  }

  static async readPersistedStatus(repoRoot: string): Promise<FederationSupervisorStatus | null> {
    const p = FederationSupervisor.statePath(repoRoot);
    if (!fs.existsSync(p)) return null;
    const state = JSON.parse(fs.readFileSync(p, "utf8")) as PersistedState;
    const floci = await probeFlociHealth(resolveFlociEndpoint());
    return {
      mode: "federation",
      startedAt: state.startedAt,
      apiUrl: `http://127.0.0.1:${state.apiPort}`,
      mcpUrl: `http://127.0.0.1:${state.mcpPort}/mcp`,
      flociUrl: resolveFlociEndpoint(),
      weStartedFlociDocker: state.weStartedFlociDocker,
      services: [
        { name: "floci", status: floci.reachable ? "healthy" : "offline", latencyMs: floci.latencyMs },
        { name: "orchestrator", status: "healthy", detail: "assumed if state file present" }
      ]
    };
  }

  private persistState(): void {
    const p = FederationSupervisor.statePath(this.repoRoot);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const state: PersistedState = {
      startedAt: this.startedAt!,
      weStartedFlociDocker: this.weStartedFlociDocker,
      composeFiles: COMPOSE_FEDERATION,
      apiPort: this.config.apiPort,
      mcpPort: this.config.mcpPort
    };
    fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf8");
  }

  private clearState(): void {
    const p = FederationSupervisor.statePath(this.repoRoot);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  async waitForFloci(timeoutMs = 120000): Promise<FederationServiceStatus> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const probe = await probeFlociHealth(resolveFlociEndpoint(), 5000);
      if (probe.reachable) {
        return { name: "floci", status: "healthy", latencyMs: probe.latencyMs, detail: probe.healthPath };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return { name: "floci", status: "offline", detail: "timeout waiting for Floci health" };
  }

  async startFlociDocker(): Promise<void> {
    const existing = await probeFlociHealth(resolveFlociEndpoint(), 3000);
    if (existing.reachable) {
      console.log("[federation] Floci already reachable — skipping docker start");
      return;
    }

    console.log("[federation] Starting Floci via Docker Compose...");
    const result = await runDockerCompose(this.repoRoot, COMPOSE_FEDERATION, ["up", "-d", "floci"]);
    if (result.code !== 0) {
      throw new Error(`docker compose up failed: ${result.stderr || result.stdout}`);
    }
    this.weStartedFlociDocker = true;
    const flociStatus = await this.waitForFloci();
    if (flociStatus.status !== "healthy") {
      throw new Error(flociStatus.detail ?? "Floci failed to become healthy");
    }
    console.log(`[federation] Floci healthy (${flociStatus.latencyMs}ms)`);
  }

  async start(options?: { skipFlociDocker?: boolean; skipMcp?: boolean }): Promise<FederationSupervisorStatus> {
    this.startedAt = new Date().toISOString();
    const services: FederationServiceStatus[] = [];

    process.env.GHOSTSTACK_FLOCI_STRICT = String(this.config.features.flociStrict);
    process.env.GHOSTSTACK_OFFLINE_MODE = String(this.config.features.offlineMode);
    if (this.config.features.flociStrict) {
      process.env.GHOSTSTACK_FLOCI_MOCK_FALLBACK = "false";
    }

    if (this.config.features.flociAutostart && !options?.skipFlociDocker) {
      try {
        await this.startFlociDocker();
        services.push({ name: "floci", status: "healthy" });
      } catch (err) {
        services.push({ name: "floci", status: "offline", detail: (err as Error).message });
        throw err;
      }
    } else {
      const probe = await probeFlociHealth(resolveFlociEndpoint());
      services.push({
        name: "floci",
        status: probe.reachable ? "healthy" : "degraded",
        detail: probe.reachable ? undefined : "autostart disabled or unreachable",
        latencyMs: probe.latencyMs
      });
    }

    this.gsServer = await createGhostStackServer(this.repoRoot);
    services.push({
      name: "orchestrator",
      status: "healthy",
      detail: `http://127.0.0.1:${this.gsServer.port}`
    });
    console.log(`[federation] Orchestrator API http://127.0.0.1:${this.gsServer.port}`);

    if (this.config.features.mcpExternal && !options?.skipMcp) {
      this.mcpHost = new FastMcpHost({ repoRoot: this.repoRoot });
      try {
        await this.mcpHost.start();
        services.push({ name: "fastmcp", status: "healthy", detail: this.mcpHost.getMcpUrl() });
        console.log(`[federation] FastMCP ${this.mcpHost.getMcpUrl()}`);
      } catch (err) {
        services.push({ name: "fastmcp", status: "skipped", detail: (err as Error).message });
        console.warn("[federation] FastMCP skipped:", (err as Error).message);
      }
    } else {
      services.push({ name: "fastmcp", status: "skipped", detail: "mcpExternal=false" });
    }

    this.persistState();

    const shutdown = async () => {
      console.log("\n[federation] Shutting down...");
      await this.stop();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());

    return {
      mode: "federation",
      startedAt: this.startedAt,
      apiUrl: `http://127.0.0.1:${this.config.apiPort}`,
      mcpUrl: this.mcpHost?.getMcpUrl(),
      flociUrl: resolveFlociEndpoint(),
      weStartedFlociDocker: this.weStartedFlociDocker,
      services
    };
  }

  async stop(): Promise<void> {
    if (this.mcpHost?.isRunning()) {
      await this.mcpHost.stop();
    }
    if (this.gsServer) {
      await this.gsServer.stop();
      this.gsServer = null;
    }

    const statePath = FederationSupervisor.statePath(this.repoRoot);
    let weStarted = this.weStartedFlociDocker;
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as PersistedState;
      weStarted = weStarted || state.weStartedFlociDocker;
    }

    if (weStarted) {
      console.log("[federation] Stopping Floci Docker Compose stack...");
      await runDockerCompose(this.repoRoot, COMPOSE_FEDERATION, ["down", "--remove-orphans"]);
    }
    this.clearState();
    console.log("[federation] Stopped");
  }

  async status(): Promise<FederationSupervisorStatus> {
    const floci = await probeFlociHealth(resolveFlociEndpoint());
    const services: FederationServiceStatus[] = [
      {
        name: "floci",
        status: floci.reachable ? "healthy" : "offline",
        latencyMs: floci.latencyMs,
        detail: floci.error
      }
    ];

    let apiStatus: FederationServiceStatus = { name: "orchestrator", status: "offline" };
    try {
      const res = await fetch(`http://127.0.0.1:${this.config.apiPort}/health`, {
        signal: AbortSignal.timeout(3000)
      });
      apiStatus = {
        name: "orchestrator",
        status: res.ok ? "healthy" : "degraded",
        detail: `http://127.0.0.1:${this.config.apiPort}`
      };
    } catch {
      apiStatus.detail = "API not reachable";
    }
    services.push(apiStatus);

    const mcpPort = this.config.mcpPort;
    let mcpStatus: FederationServiceStatus = { name: "fastmcp", status: "offline" };
    try {
      await fetch(`http://127.0.0.1:${mcpPort}/mcp`, { signal: AbortSignal.timeout(2000) });
      mcpStatus = { name: "fastmcp", status: "healthy", detail: `http://127.0.0.1:${mcpPort}/mcp` };
    } catch {
      mcpStatus = { name: "fastmcp", status: "skipped", detail: "not running" };
    }
    services.push(mcpStatus);

    return {
      mode: this.gsServer ? "federation" : "standalone",
      apiUrl: `http://127.0.0.1:${this.config.apiPort}`,
      mcpUrl: `http://127.0.0.1:${mcpPort}/mcp`,
      flociUrl: resolveFlociEndpoint(),
      weStartedFlociDocker: this.weStartedFlociDocker,
      services
    };
  }

  /** Block until API server closes (after SIGINT). */
  async runForeground(): Promise<void> {
    await this.start();
    await new Promise<void>(() => {
      /* SIGINT handler calls stop() */
    });
  }
}
