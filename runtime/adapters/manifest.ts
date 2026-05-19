/**
 * Vendored app integration policy for GhostStack federation.
 * Orchestrator stays lean; heavy services are Docker-first.
 */

export type AdapterIntegrationMode =
  | "orchestrated" // thin TS adapter + optional Docker
  | "docker-only"
  | "optional"
  | "reference"; // vendored copy only, no GhostStack wiring yet

export type AdapterManifestEntry = {
  id: string;
  path: string;
  mode: AdapterIntegrationMode;
  defaultPort?: number;
  healthPath?: string;
  description: string;
};

export const ADAPTER_MANIFEST: AdapterManifestEntry[] = [
  {
    id: "floci",
    path: "apps/floci",
    mode: "orchestrated",
    defaultPort: 4566,
    healthPath: "/health",
    description: "AWS emulator — structural execution substrate (S3/SQS/DynamoDB/Lambda)"
  },
  {
    id: "fastmcp",
    path: "apps/fastmcp",
    mode: "docker-only",
    defaultPort: 8000,
    healthPath: "/mcp",
    description: "MCP server framework — spawn via Docker or local venv"
  },
  {
    id: "codebuff",
    path: "apps/codebuff",
    mode: "optional",
    description: "Multi-agent coding runtime — integrate when workflow needs codegen"
  },
  {
    id: "spec-kit",
    path: "apps/spec-kit",
    mode: "optional",
    description: "Spec-driven CLI — feeds specs/ workflow definitions"
  },
  {
    id: "free-claude-code",
    path: "apps/free-claude-code",
    mode: "optional",
    description: "Local Claude API proxy"
  },
  {
    id: "CloakBrowser",
    path: "apps/CloakBrowser",
    mode: "docker-only",
    description: "Stealth browser — used by browser-adapter when offline=false"
  },
  {
    id: "Scrapling",
    path: "apps/Scrapling",
    mode: "optional",
    description: "Scraping framework — scraping-adapter can shell out later"
  },
  {
    id: "airllm",
    path: "apps/airllm",
    mode: "reference",
    description: "Local LLM inference — external Ollama preferred"
  },
  {
    id: "claude-mem",
    path: "apps/claude-mem",
    mode: "reference",
    description: "Session memory plugin — not wired to orchestrator"
  },
  {
    id: "Vane",
    path: "apps/Vane",
    mode: "reference",
    description: "Weather/dashboard app — not part of orchestration core"
  }
];

export function getManifestEntry(id: string): AdapterManifestEntry | undefined {
  return ADAPTER_MANIFEST.find((e) => e.id === id);
}
