# GhostStack — Audit & Roadmap

**Last updated:** 2026-06-10
**Current state:** v1.1.2, 62/63 test suites / 468/473 tests green, 0 ESLint errors, 0 TS errors

---

## ✅ DONE — v1.1.2 (this sprint)

| ID | Description |
|---|---|
| B1 | Fixed broken `$schema` keys in all JSON schemas |
| B2 | Added `runLoop()` to `ITaskExecutor` interface |
| B3 | Deduplicated env parsing — `ghoststack-config.ts` uses `loadEnvFile()` |
| B4 | `FileQueueBackend` wired into runtime-context; orchestrator typed to `IQueueBackend` |
| B5 | `RELEASE_NOTES.md` corrected with accurate benchmarks |
| A1 | `StructuredLogger` rewritten with `LOG_LEVEL`, `LOG_FORMAT=json`, `LOG_FILE` file sink; `NullLogger` added |
| A3 | Optional `ILogger` threaded into `LocalEventBus`, `HealthMonitor`, `AgentBus`, `RuntimeCompactor`; all `console.*` replaced with `if/else` guards |
| A4 | `POST /runtime/plan`, `GET /runtime/queue`, `DELETE /runtime/queue/dlq/clear` endpoints added; route ordering fixed |
| F6 | `gs run <spec-path>` CLI command |
| F7 | `gs submit <objective>` CLI command |
| T1 | `RuntimeManager` tests (16 cases) |
| T2 | `PlanningEngine` blueprint + override tests |
| T3 | `/health` endpoint tests incl. auth guard |
| T4 | `FileQueueBackend` + `TaskExecutor` integration tests |
| **FIX** | `package.json` version bumped to `1.1.2` |
| **FIX** | `submitAndExecuteTasks()` now uses `runLoop()` — exponential backoff respected on retries |
| **FIX** | `submitAndRun()` no longer drains the queue twice — single pass, accurate `processed` count |
| **FIX** | `runOptions` (maxIterations, idleDelayMs) now forwarded through `submitCognitiveObjective()` |
| **FIX** | `filter_content` reads upstream task output from persistence when `sourceTaskId` + persistence wired; falls back to sample lines |
| **FIX** | Workflow engine `taskResults` now populated from actual persistence state instead of hardcoded `{ status: "completed" }` |
| **FIX** | `axios` added to `dependencies`; `playwright` moved to `optionalDependencies` |

---

## 🔴 Open — Critical

*(none)*

---

## 🟠 Open — Architecture

### A2 — `AgentBus.messages[]` grows unbounded
Every message pushed to `AgentBus` appends to an in-memory array with no size cap, no TTL
enforcement, and no compaction. Long-running instances will OOM.
Fix: cap at a configurable `maxHistory` (default 1000) and honour `ttlMs` on `AgentMessage`
to expire entries during reads.

### A5 — Schema validation declared but never executed at runtime
`schemas/task.schema.json` and `schemas/spec.schema.json` exist but nothing in the runtime
validates tasks or specs against them. `spec-loader.ts` does structural checks manually.
Fix: add a lightweight JSON Schema validator call inside `spec-loader.ts` and `task-payload.ts`.

### A7 — `mcp_registry.json` is empty
`schemas/mcp_registry.json` has `"servers": []`. The MCP bridge never persists registrations here.
Either populate it on startup or document that operators must add entries manually.

### A8 — `RuntimeManager.getActiveServices()` silently auto-registers unknowns
Config-defined services (from `services.yaml`) that are not in the in-memory map get
auto-registered as `status: "unknown"`. Separate "declared services" from "runtime services".

### A9 — Orchestrator constructor takes 14 positional parameters
Extremely fragile — replace with a `GhostStackOrchestratorOptions` object.

---

## 🟡 Open — Missing Features

### F3 — Redis `IQueueBackend` adapter
`RedisQueueBackend` implementing `IQueueBackend` via `LPUSH`/`BRPOP`. Clean adapter — executor
doesn't know or care about the backend.

### F4 — Queue depth + DLQ metrics
`FileQueueBackend` doesn't emit metrics on every push/pop. Add:
- `queue.active_length` gauge on push/pop
- `queue.dlq_length` gauge on `moveToDeadLetter`

### F5 — Approval webhook / callback
`ApprovalWorkflow` has no outbound notification. Add:
- `POST /runtime/approvals/pending` — list pending approvals
- `GHOSTSTACK_APPROVAL_WEBHOOK_URL` — fires a POST when approval is created

### F8 — `gs dlq` CLI command
- `gs dlq list` — list dead-letter jobs with error reason
- `gs dlq retry <job-id>` — re-push a DLQ job to active queue (reset retries)
- `gs dlq clear` — drop all DLQ jobs

---

## 🔵 Open — Code Quality

### Q1 — Replace `any` in core interfaces
- `IExecutionAdapter.execute(task: any)` → `execute(task: Record<string, unknown>, context: IExecutionContext)`
- `IEventStore.replayEvents(): Promise<any[]>` → `Promise<EventRecord[]>` with proper type
- `IPlanningEngine.generatePlan(objective, context?: any)` → `context?: Record<string, unknown>`

### Q2 — `ITaskDependencyResolver` not injectable
Orchestrator hardcodes `new TaskDependencyResolver()`. Should be injectable like all other deps.

### Q3 — `spec.schema.json` priority enum mismatch
Still says `["low","normal","high","critical"]`; queue uses `"medium"` not `"normal"` and has no `"critical"`.

### Q4 — `healthcheck.ts` skips `data-runtime/` and `specs/` dirs

### Q5 — `apps/` directory undocumented
`CloakBrowser`, `Scrapling`, `Vane`, `airllm`, `fastmcp`, `floci` — none documented in relation to orchestration layer.

---

## 🟢 Open — Testing Gaps

### T5 — No test for `Orchestrator.submitAndRun()`
Verify: plan generated, governance evaluated, queue drained once, accurate `processed` count.

### T6 — No test for `EnvLoader` propagation
`createRuntimeContext()` calls `loadEnvFromRoot()` — no test that variables from `.env` propagate.

---

## 📋 Open — Documentation

### D2 — `OPERATIONS.md` references stale scripts
Missing: `npm run typecheck`, `npm run build`, `npm run test:coverage`, `npm run lint:fix`.
Boot diagram doesn't show `env-loader` or `FileQueueBackend`.

### D3 — `apps/` directory has no README

### D4 — No `CONTRIBUTING.md`

---

## 📊 Priority Matrix (remaining backlog)

| ID | Impact | Effort | Priority |
|---|---|---|---|
| T5 | High | Low | Next |
| T6 | Medium | Low | Next |
| A2 | High | Low | Next |
| F8 | Medium | Low | Next |
| F4 | Medium | Low | Next |
| A9 | Medium | High | Backlog |
| A5 | Medium | High | Backlog |
| F3 | Medium | High | Backlog |
| Q1–Q5 | Low | Low | Backlog |
| D2–D4 | Low | Low | Backlog |
| A7/A8 | Low | Medium | Backlog |
| F5 | Low | Medium | Backlog |
