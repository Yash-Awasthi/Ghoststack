# GhostStack — Roadmap

**Last updated:** 2026-06-10
**Current state:** v1.2.0 · 485 tests · 64 suites · 0 ESLint errors · 0 TS errors

---

## Completed in v1.2.0

| ID | Description |
|---|---|
| W1 | `WebSearchAdapter`, `CodeAgentPool`, `LocalInferenceAdapter` wired into `TaskExecutor` adapter chain |
| W2 | `adapterType` field added to `ITaskSynthesisResult`; threaded through planning engine → orchestrator → task queue |
| W3 | `search`, `code`, `inference` blueprints added to `PlanningEngine`; `PRIORITY_ORDER` extended |
| W4 | `CodeAgentPool.canExecute` accepts generic `"code"` type; resolves to `CodeEditorAgent` for dispatch |
| F1 | `offlineMode` default fixed — unset env var no longer silently enables offline/mock mode |
| F2 | Planner → executor disconnect fixed — `submitCognitiveObjective` now threads `type`/`action`/`arguments` onto enqueued Tasks |
| F3 | `task-payload.ts` fallback routing extended with `search`/`code`/`inference` branches + type-only fast path |
| F4 | `GroqModelProvider.generateObject` — no longer prepends duplicate system message when caller already provides one |
| F5 | `FreeModelProvider.streamText` — real SSE streaming for groq routes instead of single blocking chunk |
| C1 | All third-party names stripped from bridges, adapters, error strings, and comments |
| C2 | `apps/` cleaned: 9 directories removed; `floci` retained |
| C3 | Root HTML artefacts deleted; temp DB dirs purged |

---

## Open — Architecture

### A7 — `mcp_registry.json` is static
`schemas/mcp_registry.json` has `"servers": []`. The MCP bridge never persists registrations here at runtime. Either populate on startup or document that operators must populate manually.

### A8 — `RuntimeManager.getActiveServices()` auto-registers unknowns
Config-defined services not in the in-memory map get auto-registered as `status: "unknown"`. Separate "declared" from "active" services for cleaner semantics.

---

## Open — Missing Features

### F-REDIS — Redis `IQueueBackend` adapter
`RedisQueueBackend` implementing `IQueueBackend` via `LPUSH`/`BRPOP` for multi-process deployments.

### F-METRICS — Queue depth + DLQ metrics
`FileQueueBackend` does not emit metrics on push/pop/moveToDeadLetter. Add counters to `MetricsCollector`.

### F-WEBHOOK — Approval webhook / callback
`ApprovalWorkflow` has no outbound notification. Wire up `GHOSTSTACK_APPROVAL_WEBHOOK_URL` for human-in-the-loop flows.

### F-LLM-PLAN — LLM-backed planning engine
`PlanningEngine` uses keyword matching. Replace `selectBlueprint` with an `ILanguageModel.generateObject` call that maps any objective to a structured plan JSON, with keyword matching as fallback.

---

## Open — Code Quality

### Q1 — Replace `any` in core interfaces
- `IExecutionAdapter.execute(task: any)` → `execute(task: Record<string, unknown>, context: IExecutionContext)`
- `IEventStore.replayEvents(): Promise<any[]>` → `Promise<EventRecord[]>`

### Q2 — `ITaskDependencyResolver` not injectable
Orchestrator hardcodes `new TaskDependencyResolver()` — prevents substitution in tests.

### Q3 — `spec.schema.json` priority enum mismatch
Declares `["low","normal","high","critical"]`; queue uses `"medium"` not `"normal"`.

---

## Open — Testing Gaps

### T5 — No test for `Orchestrator.submitAndRun()`
Integration test covering the full plan → govern → execute → drain cycle.

### T6 — No test for `EnvLoader` propagation
Verify that env vars loaded from `.env` via `loadEnvFromRoot` are visible to all downstream components.

### T7 — No test for new adapter routing via cognitive objective
End-to-end test: `submitCognitiveObjective("search for X")` → `WebSearchAdapter.execute()`.

---

## Open — Documentation

### D2 — `OPERATIONS.md` references stale scripts
Some `gs` sub-commands documented in `OPERATIONS.md` have changed signatures.

### D3 — `apps/floci` has no README
Document what `floci` provides and how it emulates AWS services locally.

### D4 — No `CONTRIBUTING.md`
Add contribution guide covering branch naming, test requirements, and commit message conventions.

---

## Priority Matrix

| ID | Impact | Effort | Priority |
|---|---|---|---|
| T7 | High | Low | Next |
| T5 | High | Low | Next |
| F-LLM-PLAN | High | Medium | Next |
| T6 | Medium | Low | Next |
| F-METRICS | Medium | Low | Backlog |
| Q3 | Low | Low | Backlog |
| F-REDIS | Medium | High | Backlog |
| Q1 | Low | Medium | Backlog |
| A7/A8 | Low | Medium | Backlog |
| F-WEBHOOK | Low | Medium | Backlog |
| D2–D4 | Low | Low | Backlog |
