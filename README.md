# GhostStack

**Local-first multi-agent orchestration nucleus** — a production-grade TypeScript runtime for spec-driven, governed, fault-tolerant task execution with no external AI dependency.

```bash
gs submit "ingest data from S3 bucket my-dataset"
# → Planning Engine generates a task graph from natural language
# → Governance Engine evaluates constraints, policies, and guardrails
# → Executor drains queue with exponential backoff and circuit breaking
# → Results persisted; event log replayed automatically on crash recovery
```

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-6-blue)
![Tests](https://img.shields.io/badge/tests-468%20passing-brightgreen)
![ESLint](https://img.shields.io/badge/ESLint-0%20errors-brightgreen)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      GhostStack Runtime                         │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐  │
│  │  Planning    │   │  Governance  │   │  Approval          │  │
│  │  Engine      │──▶│  Engine      │──▶│  Workflow          │  │
│  │  8 blueprints│   │  constraints │   │  (human-in-loop)   │  │
│  └──────────────┘   │  policies    │   └────────────────────┘  │
│                     │  guardrails  │                            │
│                     └──────┬───────┘                            │
│                            │                                    │
│  ┌─────────────────────────▼────────────────────────────────┐   │
│  │                  GhostStackOrchestrator                  │   │
│  │      submitAndRun(objective) → plan → govern → execute   │   │
│  └──────────┬─────────────────────────────────┬─────────────┘   │
│             │                                 │                 │
│     ┌───────▼──────┐                ┌─────────▼──────────┐     │
│     │ FileQueue    │                │   Task Executor    │     │
│     │ Backend      │◀───────────────│   runLoop() +      │     │
│     │ JSONL+DLQ    │                │   retry backoff    │     │
│     └──────────────┘                └────────┬───────────┘     │
│                                              │                 │
│     ┌──────────────┐     ┌──────────────────▼──────────────┐  │
│     │  Circuit     │     │         Execution Adapters       │  │
│     │  Breaker     │─────│  Floci (AWS)  Browser  Scraping  │  │
│     │  sliding     │     └─────────────────────────────────┘   │
│     │  window      │                                           │
│     └──────────────┘                                           │
│                                                                 │
│  ┌─────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ Memory      │  │  Runtime Graph   │  │  Runtime          │  │
│  │ Store       │  │  topology +      │  │  Compactor        │  │
│  │ 4 indexes   │  │  cycle detect +  │  │  adaptive         │  │
│  │ TTL + prune │  │  validate+repair │  │  heuristics       │  │
│  └─────────────┘  └──────────────────┘  └───────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │          HTTP API  ·  gs CLI (30+ commands)  ·  MCP     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Features

### Execution Engine
- **Priority-weighted FIFO queue** — `FileQueueBackend` backed by atomic JSONL writes with in-process priority ordering
- **Exponential-backoff retry loop** — `runLoop(maxIterations, idleDelayMs)` with configurable thresholds; backoff delay respected between iterations
- **Dead-letter queue** — exhausted jobs quarantined; operator recycling via `clearDeadLetterQueue()`; `gs dlq` CLI for inspection
- **Crash recovery** — append-only JSONL event log replayed on startup; corrupt lines quarantined automatically

### Governance Stack
- **Planning Engine** — 8 blueprint types (`ingestion`, `scraper`, `backup`, `etl`, `research`, `dangerous`, `delete`, `default`) with key=value arg extraction and priority-ordered keyword matching
- **Governance Engine** — composable evaluation pipeline run before every execution:
  - Constraints: `ResourceScopeConstraint`, `CostBudgetConstraint`
  - Policies: `DangerousOperationPolicy`, `WildcardPermissionsPolicy`
  - Guardrails: `LoopDetectionGuardrail`, `RunawayRetriesGuardrail`, `TaskGraphLimitGuardrail`
- **Approval Workflow** — human-in-the-loop gating with CLI approve/cancel and event-sourced audit trail

### Resilience
- **Circuit Breaker** — sliding-window failure counting (`failureWindowMs`, default 60 s); half-open recovery; `HealthAwareCircuitBreaker` with configurable health probe interval
- **Runtime Compactor** — adaptive compaction triggered by journal growth rate, heap %, EventBus backpressure, and quota violations; `LeakDetector` tracks heap and subscription growth over rolling readings
- **Write-verify persistence** — every state write is read back and compared; second-write retry on mismatch; corrupt files quarantined with timestamp suffix

### Observability
- **Structured Logger** — `LOG_LEVEL`, `LOG_FORMAT=json`, `LOG_FILE` sink; `ILogger` interface threaded through every subsystem; `NullLogger` for tests
- **Metrics Collector** + **Trace Recorder** — gauge, counter, timing, and span tracking; `DiagnosticEnricher` correlates metrics with traces
- **TraceIndexer** — auto-indexes EventBus events into MemoryStore for cross-agent semantic retrieval
- **RuntimeInspector** — unified diagnostic surface (queue depth, memory stats, workflow history, agent bus, circuit breaker state)

### Memory & Knowledge Layer
- **MemoryStore** — four index Sets (`byAgent`, `byType`, `byTag`, `byWorkflow`) with O(1) lookup; TTL eviction cleans all indexes atomically via `_removeFromIndexes()`; configurable auto-prune timer
- **AgentBus** — bounded ring buffer (configurable `maxMessages`); TTL sweep on push and read; request-response delegation with timeout and subscription teardown; capability registry
- **RuntimeGraph** — directed graph of agents, services, and workflow executions; Kahn-style topological sort; cycle detection; validate + repair operations; persisted journals with compaction

### Workflow Engine
- 5 built-in templates: `BrowserResearchWorkflow`, `LocalCloudProvisioning`, `DocumentProcessing`, `SpecToExecution`, `GovernedETL`
- JSON spec loading with full structural validation: required fields per task, duplicate ID detection, dangling dependency references, priority enum enforcement
- S3-event auto-trigger pipeline; idempotency tokens for duplicate-safe execution; state verification checkpoints
- Workflow events automatically stored in MemoryStore and reflected in RuntimeGraph topology

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 6, strict, zero `any` in public interfaces |
| Runtime | Node.js 20+, `ts-node` for development |
| Queue persistence | Priority-weighted JSONL (`FileQueueBackend`) |
| Event persistence | Append-only JSONL event log (`FileEventStore`) |
| State persistence | JSON KV store with write-verify (`FileRuntimePersistence`) |
| Config | `.env` + `ghoststack.config.json` + YAML service registry |
| HTTP API | Native `http.createServer` — zero framework overhead |
| Testing | Jest — 473 tests, 63 suites, deterministic assertions |
| Linting | ESLint + `@typescript-eslint` — 0 errors |
| Cloud emulation | Floci (LocalStack-compatible AWS API surface) |
| Browser automation | Playwright (optional dependency) |
| Scraping | Axios with offline simulation fallback |

---

## Project Stats

```
Test suites : 62 passing / 63 total (1 environment-skipped)
Tests       : 468 passing / 473 total (5 environment-skipped)
TypeScript  : 0 errors
ESLint      : 0 errors
Version     : 1.1.3
```

---

## Quick Start

```bash
# Install dependencies
npm install

# Scaffold config, directories, and an example workflow spec
npm run gs -- init

# Type-check the entire codebase
npm run typecheck

# Run the full test suite
npm test

# Start the HTTP API server
npm run start

# Generate a governed execution plan from natural language
npm run gs -- plan "deploy ingestion pipeline bucketName=raw-data"

# Submit an objective end-to-end (plan → govern → queue → execute)
npm run gs -- submit "ingest data from S3 bucket my-dataset"

# Load and run a workflow spec file directly
npm run gs -- run ./specs/demo-etl/workflow-spec.json

# Inspect queue state, DLQ, and execution history
npm run gs -- queue
npm run gs -- dlq list
npm run gs -- workflows:executions
```

---

## CLI Reference

```
gs init                    Scaffold config, directories, and example spec
gs start                   Start HTTP API server (foreground)
gs start:federation        Boot Floci + API + FastMCP as supervised group
gs submit <objective>      Plan → govern → execute from natural language
gs run <spec-path>         Execute a workflow spec file immediately
gs plan <objective>        Preview generated task graph without executing
gs queue                   Show pending and dead-letter queue state
gs dlq list                List dead-letter jobs with retry counts
gs dlq retry <job-id>      Re-enqueue a specific dead-letter job
gs dlq clear               Drop all dead-letter jobs
gs workflows               List registered workflow definitions
gs workflows:executions    Show execution history and telemetry
gs approve <id>            Approve a pending governance-gated execution
gs cancel <id>             Cancel a running execution
gs memory                  Query MemoryStore entries and stats
gs graph                   RuntimeGraph topology snapshot
gs graph:validate          Check for cycles, dangling edges, missing deps
gs graph:repair            Remove dangling edges and fix inconsistencies
gs graph:prune             Remove stale/failed nodes
gs diagnose                Config + healthcheck + federation status
gs logs [limit]            Show recent event log entries
gs version                 Print version and runtime info
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GHOSTSTACK_API_PORT` | `3000` | HTTP API listening port |
| `GHOSTSTACK_FLOCI_URL` | `http://localhost:4566` | Floci/LocalStack endpoint |
| `GHOSTSTACK_OFFLINE_MODE` | `true` | Disable live Floci calls (safe default) |
| `GHOSTSTACK_FLOCI_STRICT` | `false` | Fail hard on Floci errors |
| `GHOSTSTACK_MCP_PORT` | `8100` | MCP Bridge port |
| `GHOSTSTACK_DATA_DIR` | `./data-runtime` | Queue, event log, and state directory |
| `GHOSTSTACK_BACKUP_ON_START` | _(unset)_ | Snapshot persistence files on boot |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `LOG_FORMAT` | _(plain)_ | Set to `json` for structured JSON output |
| `LOG_FILE` | _(unset)_ | Append logs to a file path |
| `GHOSTSTACK_API_TOKEN` | _(unset)_ | Bearer token for API authentication |

---

## Workflow Spec Format

```json
{
  "spec_version": "v1.1",
  "metadata": {
    "name": "My ETL Pipeline",
    "description": "Scrape → filter → store"
  },
  "template_id": "governed-etl-template",
  "tasks": [
    {
      "id": "extract",
      "title": "Scrape source URL",
      "description": "Fetch raw HTML content",
      "type": "scraping",
      "action": "scrape_url",
      "priority": "high",
      "arguments": { "url": "https://example.com" },
      "dependencies": []
    },
    {
      "id": "transform",
      "title": "Filter content",
      "description": "Apply regex filter to extracted lines",
      "type": "floci",
      "action": "filter_content",
      "priority": "medium",
      "arguments": { "pattern": "AI|TypeScript", "sourceTaskId": "extract" },
      "dependencies": ["extract"]
    }
  ]
}
```

Validation enforced at parse time: required fields, unique IDs, valid priority (`low` / `medium` / `high` / `critical`), and no dangling dependency references.

---

## Robustness Audit

All correctness bugs identified across two systematic audit passes have been resolved. Selected highlights:

| Bug | Description | Fix |
|---|---|---|
| B6 | `MemoryStore.prune()` left stale IDs in all 4 index Sets | `_removeFromIndexes()` helper cleans atomically |
| B8 | DLQ recycling left jobs in both DLQ and active queue | `clearDeadLetterQueue()` added to interface + both backends |
| B9 | CircuitBreaker tripped on lifetime failure count | Sliding-window `failureTimestamps[]` with configurable window |
| B3 | `submitAndRun()` drained queue twice | Single-pass through `submitCognitiveObjective()` |
| B2 | Retry backoff bypassed by raw `while` loop | Replaced with `runLoop()` which respects `_pendingRetryDelayMs` |
| A2 | `AgentBus.messages[]` grew unbounded | Ring buffer cap + TTL sweep on push and read |
| A5 | `parseWorkflowSpec()` had no per-task validation | Full structural validation: fields, IDs, deps, priority |

---

## License

MIT
