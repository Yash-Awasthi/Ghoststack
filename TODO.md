# GhostStack — Deep Audit & Roadmap

**Audit date:** 2026-06-10
**Current state:** v1.1.2, 59 test suites / 414 tests green, 0 lint errors, 0 TS errors

---

## 🔴 Critical Bugs (fix immediately)

### B1 — Broken `$schema` key in JSON schemas
`schemas/task.schema.json` and `schemas/orchestration.schema.json` both use `""` (empty string)
as the key for the schema URL instead of `"$schema"`. Any validator will ignore the schema
declaration entirely, making validation results meaningless.

```json
// current (broken)
{ "": "http://json-schema.org/draft-07/schema#" }
// correct
{ "$schema": "http://json-schema.org/draft-07/schema#" }
```

Affected: `task.schema.json`, `orchestration.schema.json` (likely all schemas — audit the rest).

---

### B2 — `ITaskExecutor` interface missing `runLoop()`
`runLoop()` was added to `TaskExecutor` class (v1.1.1) but never added to the `ITaskExecutor`
interface in `orchestration/interfaces/execution.interface.ts`. Any code typed against the
interface cannot call it — you'd get a runtime error or require a cast.

Fix: add `runLoop(maxIterations?: number, idleDelayMs?: number): Promise<number>` to the interface.

---

### B3 — `ghoststack-config.ts` duplicates env file parsing
`runtime/ghoststack-config.ts` has its own private `parseEnvFile()` + `applyEnvMap()` functions
that do exactly what `runtime/env-loader.ts` (added v1.1.2) does, but with less robustness
(no quote handling for inline-comment stripping). Two code paths doing the same thing — they'll
diverge over time. `loadGhostStackConfig()` should import and use `loadEnvFile()`.

---

### B4 — `FileQueueBackend` exists but is never used at runtime
`FileQueueBackend` was created in v1.1.2 as the persistent queue backend, but
`runtime/runtime-context.ts` still instantiates `MemoryQueueBackend`. Restart GhostStack
and all queued jobs are lost. Wire `FileQueueBackend` into the context.

---

### B5 — `RELEASE_NOTES.md` has stale benchmark numbers
Claims `52 tasks/sec`, `19ms`, `1.6s contention`. Actual measured: 44 tasks/sec, 22.8ms, 2034ms.
Misleads anyone evaluating performance expectations.

---

## 🟠 Architecture Issues

### A1 — Logger has no timestamps and no log level filtering
`StructuredLogger` emits bare `[INFO] message` with JSON context dumped inline. No timestamps,
no log level filtering (debug floods production), no log file output. Replace with a proper
levelled logger:
- Configurable min level (`DEBUG | INFO | WARN | ERROR`) via `LOG_LEVEL` env var
- ISO timestamp prefix on every line
- Optional file sink: `LOG_FILE=./logs/ghoststack.log`
- Structured JSON mode: `LOG_FORMAT=json` emits `{"level":"info","ts":"...","msg":"...","ctx":{...}}`

---

### A2 — `AgentBus.messages[]` grows unbounded
Every message sent to `AgentBus` is pushed to an in-memory array with no max size, no TTL
enforcement, and no compaction. Long-running instances will OOM.
Fix: cap at a configurable `maxHistory` (default 1000) and honour `ttlMs` field already on
`AgentMessage` to expire old entries during reads.

---

### A3 — `console.log/error` leaking from orchestration layer
The orchestration layer (event-bus, agent-bus, federation-health-controller, memory-store,
persistence-manager, runtime-compactor, service-discovery) emits raw `console.log/error` calls
instead of routing through the `ILogger` interface. This bypasses log level filtering, structured
formatting, and file sinks.
All of these should accept an optional `ILogger` in their constructor and fall back to a
`NullLogger` if not provided.

---

### A4 — No HTTP API for PlanningEngine, queue ops, or agents
The PlanningEngine, queue management, and AgentBus are only accessible via CLI. They need HTTP
endpoints so external tools (dashboards, CI pipelines) can use them:

| Endpoint | Method | Purpose |
|---|---|---|
| `/runtime/plan` | POST | Generate plan from `{ "objective": "..." }` |
| `/runtime/queue` | GET | List active + DLQ jobs |
| `/runtime/queue/push` | POST | Enqueue a job |
| `/runtime/queue/dlq/clear` | DELETE | Clear dead-letter queue |
| `/runtime/agents` | GET | List registered agent capabilities |

---

### A5 — Schema validation is declared but never executed at runtime
`schemas/task.schema.json` and `schemas/spec.schema.json` exist but nothing in the runtime
actually validates tasks or specs against them. The `spec-loader.ts` does structural checks
manually. Real validation via a JSON Schema validator (or a hand-rolled checker matching the
schema shape) would catch malformed spec files early.

---

### A6 — `task.schema.json` is incomplete
Missing fields that the workflow engine actually uses: `type`, `action`, `arguments`,
`dependencies` items have no type constraint, `priority` enum doesn't match what the
queue backend expects (`low | medium | high` vs. `low | normal | high | critical`).

---

### A7 — `mcp_registry.json` is empty
`schemas/mcp_registry.json` has `"servers": []`. The MCP bridge never has real server
registrations persisted here. Either populate it with the in-process GhostStack MCP server
entry on startup, or document clearly that it is the operator's responsibility to add servers.

---

### A8 — `RuntimeManager.getActiveServices()` silently auto-registers unknown services
When config-defined services (from `services.yaml`) aren't in the in-memory map, they get
auto-registered as `status: "unknown"`. This means `getHealthSummary()` can show services
as "unknown" that have never been started — inflating the service count and masking real state.
Solution: separate the concept of "declared services" (from YAML) from "runtime services"
(actually started in this process).

---

### A9 — `Orchestrator` constructor takes 14 positional parameters
Extremely fragile — adding or reordering one parameter silently breaks all callers.
Replace with `GhostStackOrchestratorOptions` object pattern.

---

## 🟡 Missing Features

### F1 — Levelled, structured logger with file sink
(See A1 above — this is the full feature description.)
New file: `orchestration/logger.ts` — replace current 18-line `StructuredLogger` with proper
implementation. Add `NullLogger` and `TestLogger` (captures messages for test assertions).

---

### F2 — `POST /runtime/plan` HTTP endpoint + governance preview
Calling `gs plan` from the CLI is useful but operators need HTTP access. The endpoint should:
1. Accept `{ "objective": "...", "dryRun": true }`
2. Run `PlanningEngine.generatePlan()`
3. Optionally run `GovernanceEngine.evaluatePlan()` preview (without executing)
4. Return the full plan JSON including governance verdict

---

### F3 — Redis `IQueueBackend` adapter stub
The known limitation in `RELEASE_NOTES.md` says "distributed processing would require Redis/Kafka".
Add a `RedisQueueBackend` that implements `IQueueBackend` using standard Redis commands
(`LPUSH`/`BRPOP` for priority queue, `LPUSH` for DLQ). Should be a clean adapter — the executor
doesn't know or care about the backend.

---

### F4 — Metrics for queue depth and DLQ size
`FileQueueBackend` and `MemoryQueueBackend` don't emit metrics. The Prometheus endpoint can't
answer "how deep is the queue right now?" Add gauge recordings:
- `queue.active_length` — updated on every push/pop
- `queue.dlq_length` — updated on every moveToDeadLetter

---

### F5 — Approval webhook / callback
`ApprovalWorkflow` creates records and supports approve/deny, but there's no notification
mechanism. When a task requires approval, nothing pings the operator. Add:
- `POST /runtime/approvals/pending` — list all pending approvals (currently requires ctx)
- Configurable webhook `GHOSTSTACK_APPROVAL_WEBHOOK_URL` — fires a POST when approval is created

---

### F6 — `gs run <spec-path>` CLI command
The most natural thing an operator wants to do: `gs run specs/demo-etl/workflow-spec.json`.
Currently they have to know to call `gs workflows:executions` after manually wiring the spec.
This command should: load the spec → register the workflow → execute it → stream status to stdout.

---

### F7 — `gs submit <objective>` CLI command
One-shot cognitive objective via CLI: `gs submit "deploy ingestion pipeline bucketName=prod-data"`
Internally calls `orchestrator.submitAndRun()`. Prints plan → governance verdict → execution result.

---

### F8 — `gs dlq` CLI command
`gs queue` shows DLQ jobs but doesn't let you act on them. Need:
- `gs dlq list` — list dead-letter jobs with error reason
- `gs dlq retry <job-id>` — re-push a DLQ job back to active queue (reset retries)
- `gs dlq clear` — drop all DLQ jobs

---

## 🔵 Code Quality

### Q1 — Replace `any` in core interfaces
Several interfaces use `any` where concrete types are possible:
- `IExecutionAdapter.execute(task: any)` → `execute(task: Record<string, unknown>, context: IExecutionContext)`
- `IEventStore.replayEvents(): Promise<any[]>` → `Promise<EventRecord[]>` with a proper type
- `IExecutionContext.logger: any` → `ILogger`
- `IPlanningEngine.generatePlan(objective, context?: any)` → `context?: Record<string, unknown>`

---

### Q2 — `ITaskDependencyResolver` missing from orchestrator wiring
`ITaskDependencyResolver` interface exists but the orchestrator hardcodes `new TaskDependencyResolver()`
internally. It should be injectable like all other dependencies.

---

### Q3 — `spec.schema.json` priority enum mismatch
Schema says `enum: ["low", "normal", "high", "critical"]` but the queue uses `"medium"` instead
of `"normal"` and doesn't have `"critical"`. The spec loader accepts `normal` and passes it to the
queue which then maps it to weight 0 (unknown priority). Normalise to one vocabulary.

---

### Q4 — `healthcheck.ts` doesn't check `data-runtime/` or `specs/`
The healthcheck verifies folder structure but skips the runtime data directory and specs directory.
If `data-runtime/` is missing (first boot without `gs init`), the runtime silently creates it but
the healthcheck reports everything healthy before it exists.

---

### Q5 — `apps/` directory is untracked tooling
`apps/` contains: CloakBrowser, Scrapling, Vane, airllm, fastmcp, floci, etc. None are referenced
from the orchestration layer or documented. Either integrate them properly (document which ones
are used as Floci/MCP backends) or move them to an `external/` or `tools/` directory with a README.

---

## 🟢 Testing Gaps

### T1 — No tests for the expanded `RuntimeManager`
The rewrite in v1.1.1 is untested. Need coverage for:
- `markRunning/Stopped/Degraded/Error` state transitions
- `startService/stopService` with success and failure paths
- `getHealthSummary()` overall status computation
- `restartService()` sequence

---

### T2 — No tests for `PlanningEngine` argument overrides
The `extractArgumentOverrides()` function (added v1.1.0) has no dedicated tests.
Need: `key=value` extraction, numeric coercion, multi-override, blueprint merge.

---

### T3 — No tests for new HTTP endpoints
`/health` JSON structure and status codes are untested. The `http-server.test.ts` exists but
hasn't been updated to cover:
- `/health` returns `{ status, version, components }`
- `/health` returns 503 when a component is in error
- Auth guard returns 401 on missing/wrong token
- `/runtime/plan` (once added)

---

### T4 — No integration test for `FileQueueBackend` + `TaskExecutor`
`file-queue-backend.test.ts` tests the backend in isolation. Need an integration test that
wires `FileQueueBackend` → `TaskExecutor` → runs jobs → verifies persistence, retry, DLQ.

---

### T5 — No test for `Orchestrator.submitAndRun()`
The new convenience method is untested. Should verify: plan generated, governance evaluated,
queue drained, result returned.

---

### T6 — No test for `EnvLoader` in `runtime-context.ts` startup
`createRuntimeContext()` now calls `loadEnvFromRoot()` but there's no test verifying that
variables from `.env` actually propagate into the context's configuration.

---

## 📋 Documentation

### D1 — `RELEASE_NOTES.md` needs v1.1.1 and v1.1.2 sections
Currently ends at v1.1.0. Should summarise what shipped in each patch.

### D2 — `OPERATIONS.md` references stale scripts
Missing: `npm run typecheck`, `npm run build`, `npm run test:coverage`, `npm run lint:fix`.
Boot sequence diagram doesn't show env-loader or FileQueueBackend.

### D3 — `apps/` directory has no README
Nobody reading the repo knows what CloakBrowser, Scrapling, Vane, airllm, fastmcp, floci etc
are or which ones GhostStack actually depends on.

### D4 — No `CONTRIBUTING.md`
No guidelines for adding a new blueprint to `PLAN_BLUEPRINTS`, wiring a new `IQueueBackend`,
adding a new governance constraint/policy/guardrail, or writing a spec file.

---

## 📊 Priority Matrix

| ID | Impact | Effort | Do first? |
|---|---|---|---|
| B1 | High | Trivial | ✅ Yes |
| B2 | High | Trivial | ✅ Yes |
| B3 | Medium | Low | ✅ Yes |
| B4 | High | Low | ✅ Yes |
| B5 | Low | Trivial | ✅ Yes |
| A1 | High | Medium | Next sprint |
| A3 | Medium | Medium | Next sprint |
| A4 | High | Medium | Next sprint |
| F1 | High | Medium | Next sprint |
| F6 | High | Low | Next sprint |
| F7 | High | Low | Next sprint |
| T1–T6 | High | Medium | Next sprint |
| A2 | Medium | Low | Backlog |
| A5 | Medium | High | Backlog |
| A6 | Low | Low | Backlog |
| A9 | Medium | High | Backlog |
| F3 | Medium | High | Backlog |
| F5 | Low | Medium | Backlog |
| F8 | Low | Low | Backlog |
| Q1–Q5 | Low | Low | Backlog |
| D1–D4 | Low | Low | Backlog |

---

_Last updated: 2026-06-10_
