# GhostStack — Audit & Roadmap

**Last updated:** 2026-06-10
**Current state:** v1.1.3, 62/63 test suites / 468/473 tests green, 0 ESLint errors, 0 TS errors

---

## ✅ DONE — v1.1.3 (finalization sprint)

| ID | Description |
|---|---|
| A2 | `AgentBus.messages[]` capped at configurable `maxMessages` (default 1 000); `_evictExpired()` sweeps TTL on push and every `getMessages()` call |
| A5 | `parseWorkflowSpec()` extended with comprehensive structural validation: per-task required-field checks, duplicate ID detection, dangling dependency references, priority enum validation |
| A9 | `GhostStackOrchestrator.create(options)` factory added — options-object pattern available to new code; positional constructor retained for test backward-compatibility; `runtime-context.ts` migrated to factory |
| LOG | `FileEventStore`, `FileRuntimePersistence`, `MemoryStore` all accept optional `ILogger`; all internal `console.warn` calls routed through it with fallback |
| LOG | `stopRuntime()` final console.warn replaced with `ctx.logger.warn()` |

---

## ✅ DONE — v1.1.2 (second audit sprint)

| ID | Description |
|---|---|
| B6 | `MemoryStore.prune()` and `query()` TTL eviction now clean all four index Sets via `_removeFromIndexes()` helper — index leak eliminated |
| B7 | `LocalEventBus.compact()` / `compactHistory()` route through `this.logger` instead of `console.log` |
| B8 | `IQueueBackend.clearDeadLetterQueue()` added; implemented in `MemoryQueueBackend` and `FileQueueBackend`; `RuntimeCompactor.compact()` clears DLQ after recycling |
| B9 | `CircuitBreaker` now uses a sliding-window failure count (`failureTimestamps[]`, configurable `failureWindowMs`, default 60 s) instead of a lifetime accumulator |

---

## ✅ DONE — v1.1.2 (first audit sprint)

| ID | Description |
|---|---|
| B1 | Fixed broken `$schema` keys in all JSON schemas |
| B2 | Added `runLoop()` to `ITaskExecutor` interface |
| B3 | Deduplicated env parsing — `ghoststack-config.ts` uses `loadEnvFile()` |
| B4 | `FileQueueBackend` wired into runtime-context; orchestrator typed to `IQueueBackend` |
| B5 | `RELEASE_NOTES.md` corrected with accurate benchmarks |
| A1 | `StructuredLogger` rewritten with `LOG_LEVEL`, `LOG_FORMAT=json`, `LOG_FILE` file sink; `NullLogger` added |
| A3 | Optional `ILogger` threaded into `LocalEventBus`, `HealthMonitor`, `AgentBus`, `RuntimeCompactor`; all `console.*` replaced with guards |
| A4 | `POST /runtime/plan`, `GET /runtime/queue`, `DELETE /runtime/queue/dlq/clear` endpoints added |
| F6 | `gs run <spec-path>` CLI command |
| F7 | `gs submit <objective>` CLI command |
| T1 | `RuntimeManager` tests (16 cases) |
| T2 | `PlanningEngine` blueprint + override tests |
| T3 | `/health` endpoint tests incl. auth guard |
| T4 | `FileQueueBackend` + `TaskExecutor` integration tests |
| **FIX** | `submitAndExecuteTasks()` now uses `runLoop()` — exponential backoff respected on retries |
| **FIX** | `submitAndRun()` no longer drains the queue twice |
| **FIX** | `filter_content` reads upstream task output from persistence |
| **FIX** | Workflow engine `taskResults` populated from actual persistence state |
| **FIX** | `axios` in `dependencies`; `playwright` in `optionalDependencies` |

---

## 🟠 Open — Architecture

### A7 — `mcp_registry.json` is empty
`schemas/mcp_registry.json` has `"servers": []`. The MCP bridge never persists registrations here.
Either populate on startup or document that operators must add entries manually.

### A8 — `RuntimeManager.getActiveServices()` silently auto-registers unknowns
Config-defined services (from `services.yaml`) that are not in the in-memory map get
auto-registered as `status: "unknown"`. Separate "declared services" from "runtime services".

---

## 🟡 Open — Missing Features

### F3 — Redis `IQueueBackend` adapter
`RedisQueueBackend` implementing `IQueueBackend` via `LPUSH`/`BRPOP`.

### F4 — Queue depth + DLQ metrics
`FileQueueBackend` doesn't emit metrics on push/pop/moveToDeadLetter.

### F5 — Approval webhook / callback
`ApprovalWorkflow` has no outbound notification. Add `GHOSTSTACK_APPROVAL_WEBHOOK_URL`.

### F8 — `gs dlq` CLI command
`gs dlq list`, `gs dlq retry <job-id>`, `gs dlq clear`.

---

## 🔵 Open — Code Quality

### Q1 — Replace `any` in core interfaces
- `IExecutionAdapter.execute(task: any)` → `execute(task: Record<string, unknown>, context: IExecutionContext)`
- `IEventStore.replayEvents(): Promise<any[]>` → `Promise<EventRecord[]>`

### Q2 — `ITaskDependencyResolver` not injectable
Orchestrator hardcodes `new TaskDependencyResolver()`.

### Q3 — `spec.schema.json` priority enum mismatch
Still says `["low","normal","high","critical"]`; queue uses `"medium"` not `"normal"`.

### Q4 — `healthcheck.ts` skips `data-runtime/` and `specs/` dirs

### Q5 — `apps/` directory undocumented

---

## 🟢 Open — Testing Gaps

### T5 — No test for `Orchestrator.submitAndRun()`

### T6 — No test for `EnvLoader` propagation

---

## 📋 Open — Documentation

### D2 — `OPERATIONS.md` references stale scripts

### D3 — `apps/` directory has no README

### D4 — No `CONTRIBUTING.md`

---

## 📊 Priority Matrix (remaining backlog)

| ID | Impact | Effort | Priority |
|---|---|---|---|
| T5 | High | Low | Next |
| T6 | Medium | Low | Next |
| F8 | Medium | Low | Next |
| F4 | Medium | Low | Next |
| Q3 | Low | Low | Next |
| F3 | Medium | High | Backlog |
| Q1 | Low | Medium | Backlog |
| A7/A8 | Low | Medium | Backlog |
| F5 | Low | Medium | Backlog |
| D2–D4 | Low | Low | Backlog |
