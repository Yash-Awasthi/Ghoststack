import { IMetricsCollector, ITraceRecorder, ITraceSpan } from './interfaces/observability.interface';

export class MetricsCollector implements IMetricsCollector {
  private metrics: Record<string, any> = {};

  increment(metricName: string, amount: number = 1, tags?: Record<string, string>): void {
    if (!this.metrics[metricName]) {
      this.metrics[metricName] = 0;
    }
    this.metrics[metricName] += amount;
  }

  recordGauge(metricName: string, value: number, tags?: Record<string, string>): void {
    this.metrics[metricName] = value;
  }

  recordTiming(metricName: string, durationMs: number, tags?: Record<string, string>): void {
    if (!this.metrics[metricName]) {
      this.metrics[metricName] = [];
    }
    this.metrics[metricName].push(durationMs);
  }

  getMetrics(): Record<string, any> {
    return this.metrics;
  }

  reset(): void {
    this.metrics = {};
  }
}

export class TraceRecorder implements ITraceRecorder {
  private spans: ITraceSpan[] = [];

  startSpan(name: string, parentId?: string, metadata?: Record<string, any>): ITraceSpan {
    const span: ITraceSpan = {
      spanId: Math.random().toString(36).substring(2, 11),
      parentId,
      name,
      startTime: new Date(),
      metadata: metadata ? { ...metadata } : {}
    };
    this.spans.push(span);
    return span;
  }

  endSpan(spanId: string, metadata?: Record<string, any>): void {
    const span = this.spans.find(s => s.spanId === spanId);
    if (span) {
      span.endTime = new Date();
      if (metadata) {
        span.metadata = { ...span.metadata, ...metadata };
      }
    }
  }

  getSpans(): ITraceSpan[] {
    return this.spans;
  }

  clear(): void {
    this.spans = [];
  }
}
