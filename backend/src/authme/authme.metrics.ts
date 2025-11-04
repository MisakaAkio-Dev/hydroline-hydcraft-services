import { Counter, Gauge, Histogram, collectDefaultMetrics, register } from 'prom-client';

export interface AuthmeMetricsRecorder {
  setConnected(connected: boolean): void;
  observeQuery(method: string, durationMs: number): void;
  incrementVerifyFailed(reason: string): void;
}

function getOrCreateGauge(name: string, help: string): Gauge<string> {
  const existing = register.getSingleMetric(name);
  if (existing) {
    return existing as Gauge<string>;
  }
  return new Gauge({ name, help });
}

function getOrCreateHistogram(name: string, help: string, labelNames: string[]): Histogram<string> {
  const existing = register.getSingleMetric(name);
  if (existing) {
    return existing as Histogram<string>;
  }
  return new Histogram({
    name,
    help,
    labelNames,
    buckets: [5, 10, 20, 50, 100, 200, 500, 1000],
  });
}

function getOrCreateCounter(name: string, help: string, labelNames: string[]): Counter<string> {
  const existing = register.getSingleMetric(name);
  if (existing) {
    return existing as Counter<string>;
  }
  return new Counter({ name, help, labelNames });
}

let metricsCollected = false;

export class PromAuthmeMetricsRecorder implements AuthmeMetricsRecorder {
  private readonly connectedGauge = getOrCreateGauge('authme_db_connected', 'Whether authme db pool is connected');
  private readonly queryHistogram = getOrCreateHistogram('authme_db_query_time_ms', 'Authme db query latency', ['method']);
  private readonly verifyFailedCounter = getOrCreateCounter('authme_verify_failed_total', 'Authme password verification failures', ['reason']);

  constructor() {
    if (!metricsCollected) {
      collectDefaultMetrics();
      metricsCollected = true;
    }
  }

  setConnected(connected: boolean): void {
    this.connectedGauge.set(connected ? 1 : 0);
  }

  observeQuery(method: string, durationMs: number): void {
    this.queryHistogram.labels({ method }).observe(durationMs);
  }

  incrementVerifyFailed(reason: string): void {
    this.verifyFailedCounter.labels({ reason }).inc();
  }
}
