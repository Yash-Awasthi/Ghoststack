import * as fs from "fs";
import * as path from "path";

export type GhostStackConfig = {
  apiPort: number;
  flociUrl: string;
  mcpPort: number;
  dataDir: string;
  features: {
    flociAutostart: boolean;
    flociStrict: boolean;
    offlineMode: boolean;
    mcpBridge: boolean;
    mcpExternal: boolean;
  };
};

const DEFAULTS: GhostStackConfig = {
  apiPort: 3000,
  flociUrl: "http://localhost:4566",
  mcpPort: 8100,
  dataDir: "./data-runtime",
  features: {
    flociAutostart: true,
    flociStrict: false,
    offlineMode: true,
    mcpBridge: true,
    mcpExternal: true
  }
};

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function applyEnvMap(map: Record<string, string>): void {
  for (const [k, v] of Object.entries(map)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
    }
  }
}

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

/** Load `.env`, optional `ghoststack.config.json`, apply env overrides. Call once at process entry. */
export function loadGhostStackConfig(repoRoot: string): GhostStackConfig {
  const envPath = path.join(repoRoot, ".env");
  if (fs.existsSync(envPath)) {
    applyEnvMap(parseEnvFile(fs.readFileSync(envPath, "utf8")));
  }

  const configPath = path.join(repoRoot, "ghoststack.config.json");
  let fileConfig: Partial<GhostStackConfig> = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (err) {
      throw new Error(`Invalid ghoststack.config.json: ${(err as Error).message}`);
    }
  }

  const merged: GhostStackConfig = {
    apiPort: fileConfig.apiPort ?? DEFAULTS.apiPort,
    flociUrl: fileConfig.flociUrl ?? DEFAULTS.flociUrl,
    mcpPort: fileConfig.mcpPort ?? DEFAULTS.mcpPort,
    dataDir: fileConfig.dataDir ?? DEFAULTS.dataDir,
    features: {
      ...DEFAULTS.features,
      ...(fileConfig.features ?? {})
    }
  };

  if (process.env.GHOSTSTACK_API_PORT) merged.apiPort = Number(process.env.GHOSTSTACK_API_PORT);
  if (process.env.GHOSTSTACK_FLOCI_URL) merged.flociUrl = process.env.GHOSTSTACK_FLOCI_URL;
  if (process.env.GHOSTSTACK_MCP_PORT) merged.mcpPort = Number(process.env.GHOSTSTACK_MCP_PORT);
  if (process.env.GHOSTSTACK_DATA_DIR) merged.dataDir = process.env.GHOSTSTACK_DATA_DIR;

  merged.features.flociAutostart = envBool("GHOSTSTACK_FLOCI_AUTOSTART", merged.features.flociAutostart);
  merged.features.flociStrict = envBool("GHOSTSTACK_FLOCI_STRICT", merged.features.flociStrict);
  merged.features.offlineMode = envBool("GHOSTSTACK_OFFLINE_MODE", merged.features.offlineMode);
  merged.features.mcpBridge = envBool("GHOSTSTACK_MCP_BRIDGE", merged.features.mcpBridge);
  merged.features.mcpExternal = envBool("GHOSTSTACK_MCP_EXTERNAL", merged.features.mcpExternal);

  process.env.GHOSTSTACK_API_PORT = String(merged.apiPort);
  process.env.GHOSTSTACK_FLOCI_URL = merged.flociUrl;
  process.env.GHOSTSTACK_MCP_PORT = String(merged.mcpPort);
  process.env.GHOSTSTACK_DATA_DIR = merged.dataDir;
  process.env.GHOSTSTACK_API_URL = `http://127.0.0.1:${merged.apiPort}`;

  return merged;
}
