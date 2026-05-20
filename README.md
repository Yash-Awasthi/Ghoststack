# GhostStack Orchestrator

GhostStack is a strictly governed, local-first orchestration nucleus built for deterministic, verifiable workflow execution. It acts as a lightweight execution fabric that provides sandboxed environment execution, crash recovery via event-sourcing, and rigorous capability policy enforcement across local machine operations and Model Context Protocol (MCP) tool integration.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Run `npm run test`, `npm run healthcheck`, and `npm run lint` locally to verify this checkout.

## Core Architecture

GhostStack's architecture avoids autonomous "swarms" or recursive unverified planning in favor of a **deterministic execution pipeline**:
- **Orchestration Nucleus**: Safe boot sequencing, topological DAG dependency resolution, and task prioritization queueing.
- **State persistence & replay**: Append-only **JSONL event log** plus atomic JSON state snapshots (not a distributed durability WAL). Supports best-effort replay; corrupt lines are skipped with diagnostics.
- **Workflow Engine**: Maps JSON-defined declarative workflows to actionable execution traces.
- **Observability**: Structured logging, in-process timings/counters (`MetricsCollector`), and optional JSONL exports — no synthetic “scores”; measure what you run.
- **Sandboxed Execution**: Isolated browser environments and absolute-resolved filesystem bounds.

## Feature Highlights

- **Governed Workflows**: Explicit budget limits, strict policy evaluations, and required manual/automatic approval hooks.
- **Replay recovery**: Rebuild state from the JSONL event log and persisted snapshots (best-effort when lines are corrupt).
- **Browser & Scraping Integration**: Enforced crawl quotas and safe Chromium process management.
- **Diagnostic APIs**: Native HTTP endpoints to inspect execution queues, memory states, and dependency resolution.

## Repository Layout

```text
├── orchestration/       # Core orchestrator, planning, routing, queue backends
├── runtime/             # Application lifecycle, config loaders, bootstrapping
├── tests/               # Regression, unit, and benchmark suites
├── docs/                # Architecture documents, benchmarks, threat models
├── schemas/             # JSON schemas defining tasks, state, and specs
├── specs/               # Declarative workflow spec examples (e.g. demo-etl)
├── apps/                # Vendored open-source integration repos (10 projects)
├── archive/quarantine/  # Archived non-shipped narrative/spec trees (see README inside)
├── ghoststack_dossier.html   # Source of truth: 12-repo systems thesis (open in browser)
├── resource-readme.html      # Source of truth: 6 core repos reference sheet
└── docker/              # Container build and optional Phase 2 compose stacks
```

The dossier describes a **12-repository** integration thesis; **`apps/` ships 10** vendored projects today. The six core repos (floci, codebuff, spec-kit, free-claude-code, CloakBrowser, fastmcp) plus four extended integrations (airllm, claude-mem, Vane, Scrapling) are included under `apps/`. See [Phase 2 components](#phase-2-components-optional) for the remaining two.

## Quick Start

### 1. Cloning

```bash
git clone https://github.com/Yash-Awasthi/GhostStack.git
cd GhostStack
```

All integration repos are vendored under `apps/` in this repository (no git submodules required).

### 2. Dependency Installation

```bash
npm install
```

### 3. Environment Setup

Copy the placeholder variables to your local environment file:

```bash
cp .env.example .env
```

### 4. Running the Healthcheck

Verify that your core schemas and YAML configurations are valid:

```bash
npm run healthcheck
```

### 5. Running the Test Suite

Ensure the orchestration system operates as expected:

```bash
npm run test
```

### 6. Operator CLI (`gs`)

After `npm install`, use the CLI for day-to-day operations:

```bash
npx ts-node runtime/cli.ts init          # scaffold data-runtime/, specs/, config
npx ts-node runtime/cli.ts bootstrap     # boot orchestrator + replay events
npx ts-node runtime/cli.ts status        # API / Floci / MCP health snapshot
npm start                                # HTTP API on port 3000 (foreground)
npx ts-node runtime/cli.ts start:federation   # Docker Floci + API + optional MCP
npx ts-node runtime/cli.ts stop          # graceful federation shutdown
```

Aliases: `npm run gs -- <command>` (see `package.json`).

### 7. Executing Benchmarks

See measured numbers in [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md) (from the benchmark runner on a reference machine):

```bash
npm run benchmark
```

## Workflow Showcase

GhostStack natively implements adapters for standard operational tasks:
1. **Spec-to-Execution Workflow**: Reads a declarative file containing Cloud provisioning needs and executes them topologically.
2. **Governed Browser Scraping**: Performs data extractions constrained by bytes caps and strict host allowance policies.
3. **Telemetry Publishing**: Collects and ships logs across isolated runtime networks.

Example declarative spec: [`specs/demo-etl/workflow-spec.json`](specs/demo-etl/workflow-spec.json). Built-in workflow templates are registered in [`orchestration/workflow-engine.ts`](orchestration/workflow-engine.ts).

## Security Model

GhostStack runs tasks with a default-deny permissions model.
- **Governance**: Every task undergoes policy evaluation through the `GovernanceEngine`.
- **Capability Policies**: Explicit token allowance models constrain API usage and file modification depths.
- **Sandboxing**: Hard-locked `FilesystemSandbox` adapters prevent path-traversal (LFI) via strictly enforced `path.relative()` evaluation constraints.
- **Approvals**: The `ApprovalWorkflow` mandates manual resolution if tasks exceed automatic bounds.

## Benchmarks

Measurements from [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md):
* **Avg Persistence Write Latency (Seq)**: 15.68 ms
* **Avg Persistence Read Latency (Seq)**: 0.27 ms
* **Avg Task Execution Dispatch Latency**: 19.27 ms
* **System Dispatch Throughput Limit**: 52 tasks/sec

## Documentation Index

### Architecture intelligence (open in browser)

- [**GhostStack Architecture Dossier**](ghoststack_dossier.html) — 12-repo systems analysis, topology, risks, and synthesis
- [**6 Core Repos Reference Sheet**](resource-readme.html) — Verbatim README excerpts for floci, codebuff, spec-kit, free-claude-code, CloakBrowser, fastmcp

### Core technical docs

- [Architecture Overview](docs/architecture.md)
- [Operational Workflows](docs/WORKFLOWS.md)
- [Security Review](docs/SECURITY_REVIEW.md)
- [Threat Model](docs/THREAT_MODEL.md)
- [Operations & Telemetry](docs/OPERATIONS.md)
- [Performance Benchmarks](docs/BENCHMARKS.md)
- [Final Validation Report](docs/FINAL_VALIDATION_REPORT.md)
- [Release Notes](docs/RELEASE_NOTES.md)

## Phase 2 Components (Optional)

These repos appear in the architecture dossier but are **not vendored under `apps/`** in v1.1 and have **no orchestration adapters yet**. Add them when you need ML pipeline automation or document archival.

| Component | Source | v1.1 status |
|-----------|--------|-------------|
| **ml-intern** | [huggingface/ml-intern](https://github.com/huggingface/ml-intern) | External — clone and run locally; GPU/HF token may be required |
| **paperless-ngx** | [paperless-ngx/paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | Optional Docker stack — Postgres + Redis + web UI |

**ml-intern** — Open-source ML engineer agent (papers, training, shipping ML code). Install per upstream docs (`uv sync`, `ml-intern` CLI). Intended role in GhostStack: ML-specific review and pipeline steps alongside AirLLM and floci Bedrock routing.

**paperless-ngx** — Document management (scan, OCR, archive). Run via optional compose (does not vendor source into `apps/`):

```bash
docker compose -f docker/docker-compose.yaml -f docker/docker-compose.optional.yaml up -d
```

Web UI: `http://localhost:8001`. Use the consume volume for watch-folder ingestion of specs and diagrams.

## Development Guide

We strictly mandate schema adherence and static checking.
* **Format**: `npm run format` (Workspace-wide Prettier standards)
* **Lint**: `npm run lint` (ESLint verification)
* **Tests**: `npm run test` (Jest)

## Known Limitations

- **Concurrency Limits**: The local single-process runtime supports up to 100 parallel executor contentions safely using file-locks. Production distribution beyond this requires external database backends (e.g. Postgres).
- **Execution Adapters**: Currently restricted to `floci` simulations, local file descriptors, and Playwright browsers.

## Future Scope

- Pluggable distributed Queue Backends (e.g., Redis, RabbitMQ).
- Native OpenTelemetry (OTLP) exporting logic.
- Expanded Execution Adapters for Docker/Containers.
- Orchestration adapters for ml-intern and paperless-ngx (Phase 2).
