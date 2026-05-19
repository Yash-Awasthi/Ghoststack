import { MetricsCollector, TraceRecorder } from "../orchestration/observability-manager";

describe("Milestone 1: Observability Core (Metrics & Tracing)", () => {
  describe("MetricsCollector", () => {
    it("should increment counters, record gauges, and track latency timing metrics correctly", () => {
      const collector = new MetricsCollector();

      collector.increment("task.executed");
      collector.increment("task.executed", 2);
      expect(collector.getMetrics()["task.executed"]).toBe(3);

      collector.recordGauge("queue.size", 5);
      expect(collector.getMetrics()["queue.size"]).toBe(5);

      collector.recordTiming("execution.duration", 120);
      expect(collector.getMetrics()["execution.duration"]).toEqual([120]);
    });
  });

  describe("TraceRecorder", () => {
    it("should start and end spans with proper parent-child hierarchy tracing", () => {
      const recorder = new TraceRecorder();

      const spanA = recorder.startSpan("orchestrator.boot", undefined, { version: "1.0" });
      expect(spanA.spanId).toBeDefined();
      expect(spanA.name).toBe("orchestrator.boot");

      const spanB = recorder.startSpan("service.health", spanA.spanId, { service: "floci" });
      expect(spanB.parentId).toBe(spanA.spanId);

      recorder.endSpan(spanB.spanId, { status: "success" });
      recorder.endSpan(spanA.spanId, { status: "success" });

      const spans = recorder.getSpans();
      expect(spans.length).toBe(2);

      const retrievedB = spans.find((s) => s.spanId === spanB.spanId);
      expect(retrievedB?.endTime).toBeDefined();
      expect(retrievedB?.metadata?.status).toBe("success");
    });
  });
});
