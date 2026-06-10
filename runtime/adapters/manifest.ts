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
    description: "AWS execution substrate — S3/SQS/DynamoDB/Lambda emulation"
  },
  {
    id: "stealth-browser",
    path: "apps/CloakBrowser",
    mode: "orchestrated",
    defaultPort: 7701,
    healthPath: "/health",
    description: "Stealth browser adapter — patched Chromium with anti-bot fingerprint bypass. Handles 'browser' task type."
  },
  {
    id: "scraping",
    path: "apps/Scrapling",
    mode: "orchestrated",
    defaultPort: 7702,
    healthPath: "/health",
    description: "Adaptive web scraping engine — anti-detection HTTP + stealth Chromium fetchers. Handles 'scrape'/'crawl' task types."
  },
  {
    id: "local-inference",
    path: "apps/airllm",
    mode: "orchestrated",
    defaultPort: 7703,
    healthPath: "/health",
    description: "Local LLM inference — sharded layer-by-layer execution (70B+ on 4GB VRAM). Handles 'inference' task type."
  },
  {
    id: "mcp-server",
    path: "apps/fastmcp",
    mode: "orchestrated",
    defaultPort: 7704,
    healthPath: "/health",
    description: "MCP server exposing GhostStack capabilities as tools via FastMCP framework."
  },
  {
    id: "web-search",
    path: "apps/Vane",
    mode: "orchestrated",
    description: "Agentic web search + answer synthesis (classify → research → synthesize). Handles 'search'/'answer' task types."
  },
  {
    id: "code-agents",
    path: "apps/codebuff",
    mode: "orchestrated",
    description: "Multi-agent code pool — FilePicker, CodeEditor, Reviewer, Researcher, Thinker. Handles code_explore/code_edit/code_review/research/reason task types."
  },
  {
    id: "free-model-provider",
    path: "apps/free-claude-code",
    mode: "orchestrated",
    description: "Multi-backend LLM routing — OpenRouter/Ollama/DeepSeek/local. Drop-in ILanguageModel for PlanningEngine."
  },
  {
    id: "memory-compaction",
    path: "apps/claude-mem",
    mode: "orchestrated",
    description: "Rolling-window importance scoring for MemoryStore.compact() — recency + type weight + tag diversity."
  },
  {
    id: "spec-kit",
    path: "apps/spec-kit",
    mode: "orchestrated",
    description: "Spec-driven workflow format — phases[], acceptance_criteria[], constraints{} fields in spec.schema.json."
  }
];

export function getManifestEntry(id: string): AdapterManifestEntry | undefined {
  return ADAPTER_MANIFEST.find((e) => e.id === id);
}
