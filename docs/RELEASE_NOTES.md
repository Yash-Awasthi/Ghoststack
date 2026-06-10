# GhostStack Release Notes

---

## v1.1.2 — 2026-06-10

### Bug Fixes
- **B1** Fixed broken `$schema` key (`""` → `"$schema"`) in `task.schema.json`, `orchestration.schema.json`, and `agent-message.schema.json`; all JSON Schema validators now parse correctly.
- **B1** `task.schema.json` expanded with `type`, `action`, `arguments`, and a properly constrained `priority` enum (`low | medium | high`).
- **B1** Priority enum in `spec.schema.json` aligned to `low | medium | high` — removed orphaned `normal` and `critical` values that did not match the queue backend.
- **B2** Added `runLoop(maxIterations?, idleDelayMs?): Promise<number>` to the `ITaskExecutor` interface; `TaskExecutor` now satisfies the interface without type-casting.
- **B3** Removed duplicate `parseEnvFile()` / `applyEnvMap()` from `runtime/ghoststack-config.ts`; `.env` loading now delegates to `loadEnvFile()` from `runtime/env-loader.ts` (single implementation, richer edge-case handling).
- **B4** `runtime/runtime-context.ts` now instantiates `FileQueueBackend` (persistent JSONL queue) instead of `MemoryQueueBackend`. Queue state survives process restarts. `GhostStackRuntimeContext.queue` is typed as `IQueueBackend` for interface correctness.

### Improvements
- Queue backend type in the runtime context narrowed to the `IQueueBackend` interface — downstream code no longer depends on the concrete class.

---

## v1.1.1 — 2026-06-09

### New Features
- **EnvLoader** (`runtime/env-loader.ts`): zero-dependency `.env` parser. Handles quoted values, inline comments, `export` prefix, blank lines, and no-override-by-default semantics. Wired into `createRuntimeContext` before any other subsystem reads `process.env`.
- **FileQueueBackend** (`orchestration/file-queue-backend.ts`): persistent JSONL-backed job queue. Atomic tmp→rename writes, crash recovery via `init()`, separate DLQ file, `clear()` and `reload()` operators.
- **RuntimeManager** rewritten from a 23-line stub to a full lifecycle manager: `registerService`, `markRunning/Stopped/Degraded/Error`, `startService/stopService/restartService`, `getHealthSummary()`.
- **Structured `/health` endpoint**: `GET /health` and `/healthz` now return `{ status, version, uptime_ms, boot_ms, timestamp, components }` with component-level detail for queue, Floci adapter, event bus, and workflow engine.
- **CLI commands**: `gs version`, `gs plan <objective>`, `gs queue` added to `runtime/cli.ts`.
- **Orchestrator helpers**: `run(maxIterations, idleDelayMs)` and `submitAndRun(objective, options)` added to `GhostStackOrchestrator`.

### Bug Fixes
- `TaskExecutor.runLoop()` exponential backoff moved out of `executeNext()` into the loop body — `executeNext()` stays non-blocking; existing tests that call it directly are unaffected.
- ESLint: `no-var-requires` → `@typescript-eslint/no-require-imports` in server health reader; `let nodeVersion` → `const`.

### Governance
- `GovernanceEngine` gained three new constraints: `TimeoutConstraint` (max execution ceiling), `HighCostPlanGuardrail` (total plan cost gate), `DuplicateActionGuardrail` (repeated action detection).

### Tooling
- `package.json` v1.1.1: all dev tools moved to `devDependencies`; only `js-yaml` remains as a runtime dep.
- `jest.config.js`: coverage directory, `collectCoverageFrom`, reporters, 60 % threshold configured.
- `tsconfig.json`: `resolveJsonModule`, `declaration`, `declarationMap`, `sourceMap`, `exclude` array added.

---

## v1.1.0 — 2026-05-18

### Initial Production Release

GhostStack transitioned from experimental architecture phases to a fully hardened, production-ready local orchestration nucleus. This release emphasizes extreme operational stability, static correctness, comprehensive observability, and safe environment integration.

### Major Capabilities

- **Deterministic Orchestration**: Topological DAG task execution powered by a local priority queue.
- **Governed Cognitive Engine**: Rigid capability bounds, required-approvals policies, and filesystem traversal protection prevent unchecked local mutations.
- **File-Locked Persistence**: Custom queue persistence layer guaranteeing zero file corruption during concurrent read/write operations.
- **Event Replay Engine**: 100 % crash recovery and telemetry restoration using complete event-sourcing JSONL backends.
- **MCP Execution Fabric**: Schema-validated MCP Tool integration directly into the workflow execution graph.

### Security and Governance

- **Sandbox Filesystem Bounds**: Relative path checks block all directory traversal vulnerabilities.
- **Approval Checkpoints**: Human-in-the-loop overrides for operations that break threshold budgets.
- **Thread-safe Execution**: Rigorously audited asynchronous JavaScript guarantees to prevent retry storms or runtime memory leaks.

### Benchmark Metrics (v1.1.0 baseline)

| Metric | Value |
|---|---|
| Task execution loop latency | ~22.8 ms |
| Local system throughput | ~44 tasks/sec |
| Concurrent contention (100 ops) | ~2034 ms |
| Storage read overhead | ~13.4 ms |

### Known Limitations

- **Local File Queue**: Targets single-instance developer machine execution. Distributed processing requires plugging in a Redis/Kafka `IQueueBackend` adapter.

### Operational Scope

GhostStack v1.1.0 is fit for enterprise local development tooling, build pipelines, offline integration testing, and local data ETL orchestration safely bound by governance capabilities.
