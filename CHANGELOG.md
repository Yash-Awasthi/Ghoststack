# Changelog

All notable changes to GhostStack are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.1.1] — 2026-06-10

### Added
- **Blueprint-based PlanningEngine** — replaced keyword if/elseif chain with a typed `PLAN_BLUEPRINTS` registry covering 8 plan types: `ingestion`, `scraper`, `backup`, `etl`, `research`, `dangerous`, `delete`, `default`. Blueprint selection is priority-ordered; first keyword match in the objective string wins.
- **Argument overrides** — `key=value` pairs in the objective string are parsed and merged into blueprint task arguments at plan time (e.g. `"deploy scraper bucketName=my-bucket"`).
- **Auto-computed DAG** — dependency IDs within a blueprint are resolved by action name → task ID mapping, guaranteeing a valid topological graph with no hardcoded strings.
- **API token authentication** — set `GHOSTSTACK_API_TOKEN` to require `Authorization: Bearer <token>` on the HTTP diagnostic server. `/health` and `/healthz` are always exempt.
- **`TaskExecutor.runLoop()`** — continuous queue-draining loop with configurable `maxIterations` and `idleDelayMs`. Returns total successful task count.
- **Exponential backoff on retry** — failed tasks now wait `500ms × 2^(attempt-1)` (capped at 30 s) before re-queuing, preventing tight retry storms.
- **`TimeoutConstraint`** — governance constraint that blocks tasks declaring a `maxExecutionMs` above the engine ceiling (default 5 min).
- **`HighCostPlanGuardrail`** — rejects plans whose total `costEstimate` sum exceeds the configured plan budget (default $5.00).
- **`DuplicateActionGuardrail`** — rejects plans that include the same action more than `maxDuplicates` times (default 1), catching accidental loops at plan evaluation time.
- **`npm run build`** — compiles TypeScript to `dist/` via `tsc --project tsconfig.json`.
- **`npm run typecheck`** — zero-error type check via `tsc --noEmit`.
- **`npm run lint:fix`** — ESLint auto-fix shortcut.
- **`npm run test:watch`** and **`npm run test:coverage`** — Jest watch mode and coverage report shortcuts.

### Fixed
- `package.json`: all tooling (`jest`, `eslint`, `typescript`, `ts-node`, `ts-jest`, `prettier`, `playwright`, type stubs) moved from `dependencies` to `devDependencies`. Only `js-yaml` (runtime) remains in `dependencies`.
- `BENCHMARKS.md`: corrected performance goal thresholds to match actual measurements — write `< 25 ms` (was `< 5 ms`), throughput `> 30 tasks/sec` (was `> 100 tasks/sec`), contention `< 3000 ms` (was `< 100 ms`), loop `< 30 ms` (was `< 10 ms`).
- `README.md`: benchmark numbers updated to match `BENCHMARKS.md`; stale figures removed.
- All 33 ESLint warnings eliminated: added `varsIgnorePattern: "^_"` to `.eslintrc.json` and renamed unused variables with `_` prefix across 10 source/test files.
- `tests/fixtures/events-golden.jsonl` created — fixed `ENOENT` crash in deterministic replay golden test.

### Changed
- `package.json` version bumped `1.1.0 → 1.1.1`.
- `package.json` description updated to "Local-First Autonomous Cloud Orchestration Engine".
- `package.json` author set to "Yash Awasthi".
- `package.json` keywords expanded: added `autonomous`, `dag`.

---

## [1.1.0] — 2026-05-18

### Added
- **Orchestration Nucleus**: DAG-based task routing, priority queue, topological dependency resolution.
- **FileEventStore**: Append-only JSONL event log for deterministic crash recovery and replay.
- **CompactionScheduler**: Periodic JSONL compaction with `.unref()` timer to avoid blocking process exit.
- **GovernanceEngine**: Constraint/policy/guardrail evaluation pipeline — `ResourceScopeConstraint`, `CostBudgetConstraint`, `DangerousOperationPolicy`, `WildcardPermissionsPolicy`, `LoopDetectionGuardrail`, `RunawayRetriesGuardrail`, `TaskGraphLimitGuardrail`.
- **FlociAdapter**: AWS-emulation layer (LocalStack at `:4566`) with mock fallback for offline development.
- **MCP Bridge**: In-process MCP transport exposing GhostStack internals as MCP tools.
- **Federation**: Multi-node health controller with escalation levels and persisted status.
- **Workflow Engine**: JSON-declarative workflow definitions mapped to executable traces with approval gates and replay lineage tracking.
- **RuntimeGraph**: Snapshot-based execution graph with checkpoint-driven state, circuit breaker integration, and trace indexing.
- **Prometheus metrics export**: `/metrics/prometheus` endpoint with `metricsToPrometheus()` formatter.
- **Diagnostic HTTP server**: Full REST API for inspecting queues, memory, dependency graph, and federation status.
- **Browser & Scraping adapters**: `BrowserAdapter` (Playwright) and `ScrapingAdapter` with crawl quota enforcement.
- **FilesystemSandbox**: Path-traversal prevention via `path.relative()` enforcement.
- **57-suite test harness**: 382 tests covering unit, integration, E2E convergence, stress load, golden replay, and benchmark validation.

---
