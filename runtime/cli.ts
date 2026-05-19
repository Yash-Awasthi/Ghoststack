#!/usr/bin/env node
/**
 * GhostStack operator CLI (`gs` / `ghoststack`)
 */
import * as path from "path";
import { bootstrap } from "./bootstrap";
import { loadGhostStackConfig } from "./ghoststack-config";
import { FederationSupervisor } from "./federation-supervisor";
import { createRuntimeContext, startRuntime, stopRuntime } from "./runtime-context";
import { createGhostStackServer } from "./ghoststack-server";
import { runFederationE2e } from "./e2e-federation";
import { ADAPTER_MANIFEST } from "./adapters/manifest";
import { probeFlociHealth, resolveFlociEndpoint } from "../orchestration/floci-client";

const repoRoot = path.resolve(__dirname, "..");

function usage(): void {
  console.log(`GhostStack CLI

Usage: gs <command> [options]

Commands:
  start                Start HTTP API server (foreground)
  start:federation     Start Floci (Docker) + API + optional FastMCP
  stop                 Stop federation resources (Docker Floci if we started it)
  bootstrap            Initialize runtime (--showcase for demo workflows)
  status               Federation + Floci + API health snapshot
  health               Alias for status
  e2e                  Run federation E2E (S3 → Lambda → invoke); needs live Floci
  e2e:http             Run E2E against running API (GHOSTSTACK_API_URL)
  adapters             List vendored adapter manifest
  diagnose             Config + healthcheck + federation status
  help                 Show this help

Config: ghoststack.config.json + .env (see ghoststack.config.example.json)
`);
}

async function cmdStatus(): Promise<void> {
  const config = loadGhostStackConfig(repoRoot);
  const supervisor = new FederationSupervisor(repoRoot, config);
  const status = await supervisor.status();
  const persisted = await FederationSupervisor.readPersistedStatus(repoRoot);
  console.log(JSON.stringify({ config, live: status, persisted }, null, 2));
}

async function cmdDiagnose(): Promise<void> {
  const config = loadGhostStackConfig(repoRoot);
  console.log("=== GhostStack diagnose ===\n");
  console.log("Config:", JSON.stringify(config, null, 2));
  await cmdStatus();
  console.log("\n=== Healthcheck ===\n");
  require("./healthcheck");
}

async function cmdE2e(viaHttp: boolean): Promise<void> {
  process.env.GHOSTSTACK_FLOCI_STRICT = "true";
  process.env.GHOSTSTACK_OFFLINE_MODE = "false";
  process.env.GHOSTSTACK_FLOCI_MOCK_FALLBACK = "false";

  if (viaHttp) {
    const api = process.env.GHOSTSTACK_API_URL ?? "http://127.0.0.1:3000";
    const res = await fetch(`${api}/runtime/e2e/federation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strict: true, cleanup: true })
    });
    const body = await res.json();
    console.log(JSON.stringify(body, null, 2));
    if (!res.ok) process.exit(1);
    return;
  }

  const ctx = await createRuntimeContext(repoRoot);
  await startRuntime(ctx);
  try {
    const result = await runFederationE2e(ctx, { strict: true, cleanup: true });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "succeeded") process.exit(1);
  } finally {
    await stopRuntime(ctx);
  }
}

async function cmdStart(federation: boolean): Promise<void> {
  loadGhostStackConfig(repoRoot);
  if (federation) {
    const supervisor = new FederationSupervisor(repoRoot);
    await supervisor.start();
    await new Promise<void>(() => {
      /* SIGINT/SIGTERM handled by supervisor */
    });
    return;
  }
  const gs = await createGhostStackServer(repoRoot);
  console.log(`[GhostStack] API http://127.0.0.1:${gs.port}`);
  const shutdown = async () => {
    await gs.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  await new Promise<void>(() => {});
}

async function cmdStop(): Promise<void> {
  loadGhostStackConfig(repoRoot);
  const supervisor = new FederationSupervisor(repoRoot);
  await supervisor.stop();
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "help";

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    case "start":
      await cmdStart(false);
      break;
    case "start:federation":
      await cmdStart(true);
      break;
    case "stop":
      await cmdStop();
      break;
    case "bootstrap":
      loadGhostStackConfig(repoRoot);
      if (process.argv.includes("--showcase")) {
        process.env.GHOSTSTACK_BOOTSTRAP_SHOWCASE = "true";
      }
      await bootstrap();
      break;
    case "status":
    case "health":
      loadGhostStackConfig(repoRoot);
      await cmdStatus();
      break;
    case "e2e":
      loadGhostStackConfig(repoRoot);
      await cmdE2e(false);
      break;
    case "e2e:http":
      loadGhostStackConfig(repoRoot);
      await cmdE2e(true);
      break;
    case "adapters":
      console.log(JSON.stringify(ADAPTER_MANIFEST, null, 2));
      break;
    case "diagnose":
      loadGhostStackConfig(repoRoot);
      await cmdDiagnose();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[gs] fatal:", err);
    process.exit(1);
  });
}
