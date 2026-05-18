# GhostStack v1.1 Operational Runbook

This document defines core administrative operations, boots, diagnostic exporting, health verification, crash recovery steps, and performance profiling instructions for **GhostStack v1.1**.

---

## 1. System Boot & Initialization

To initialize and boot the GhostStack runtime orchestrator, run the bootstrap command. This command loads standard YAML configurations, starts all execution adapters, replays event history, and runs showcase governed execution tracks.

```bash
npm run bootstrap
```

### Expected Startup Log Sequence
1. **Logo Banner**: Displays the GhostStack v1.1 ASCII title.
2. **Directory Init**: Sets up runtime folders (`data-runtime/` and `logs/`).
3. **Template Registrations**: Registers `browser-research-template`, `local-provisioning-template`, etc.
4. **Historical Event Replay**: Replays events from `events.jsonl` to restore crash state.
5. **Showcase Executions**: Executes Safe, Blocked, and Security Approval workflow cycles.

---

## 2. Health & Integrity Audits

To audit system health, configurations, compilation paths, and JSON schemas, run the automated health check:

```bash
npm run healthcheck
```

The script audits:
- **Folders Integrity**: Verifies core directories are healthy.
- **Config Verifications**: Parses YAML config files to ensure syntactical validity.
- **Source Compilation**: Ensures necessary orchestrator TypeScript classes compile cleanly.
- **Schema Conformity**: Validates task and agent JSON schema documents.

If any check fails, the process exits with code `1`, halting deployments.

---

## 3. Real-Time Introspection & Metrics Logging

GhostStack records system activity through a structured file logging substrate:
- **Event Log**: `data-runtime/events.jsonl` preserves high-fidelity event lines.
- **State Store**: `data-runtime/cache.json` tracks active key-value persistence records.
- **Performance Traces**: Tracing metrics are routed to the observability registry.

### Exporting Diagnostics snapshots
To extract a complete diagnostics payload for troubleshooting, run:

```bash
npm run diagnose
```

This generates `logs/diagnostics-export.json` which packages:
- Current active queue length and dead-letter statistics.
- History of executed workflow templates and status logs.
- Registered templates and service discovery nodes.
- Total event count replayed during session boot.

---

## 4. Crash Recovery Procedures

If a host process kills the orchestrator abruptly:

```
[System Crash / Sudden Power Loss]
                       ↓
  [Process Restarts & Bootstraps EventStore]
                       ↓
[Replays events.jsonl to rebuild active state]
                       ↓
[Validates previous task completions against cache.json]
                       ↓
  [Resumes execution on pending queues smoothly]
```

To clean trace cache states during maintenance, delete the runtime databases manually:
- `Remove-Item data-runtime/*.json`
- `Remove-Item data-runtime/*.jsonl`

---

## 5. Performance Benchmarking

To profile local performance metrics (sequential persistence latency, parallel contention overhead, queue throughput), run the benchmark harness:

```bash
npm run benchmark
```

Results are stored dynamically in `docs/BENCHMARKS.md`.
- **Target Sequential Latency**: < 5ms.
- **Target Concurrency Throughput**: > 50 tasks/sec.
