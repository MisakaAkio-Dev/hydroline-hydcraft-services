import { Gauge, Histogram, collectDefaultMetrics, register } from 'prom-client';

export interface LuckpermsMetricsRecorder {
  setConnected(connected: boolean): void;
  observeQuery(method: string, durationMs: number): void;
}

function getOrCreateGauge(name: string, help: string): Gauge<string> {
  const existing = register.getSingleMetric(name);
  if (existing) {
    return existing as Gauge<string>;
  }
  return new Gauge({ name, help });
}

function getOrCreateHistogram(
  name: string,
  help: string,
  labelNames: string[],
): Histogram<string> {
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

function ensureDefaultMetricsCollected() {
  const defaultMetric = register.getSingleMetric(
    'process_cpu_user_seconds_total',
  );
  if (!defaultMetric) {
    collectDefaultMetrics();
  }
}

export class PromLuckpermsMetricsRecorder implements LuckpermsMetricsRecorder {
  private readonly connectedGauge = getOrCreateGauge(
    'luckperms_db_connected',
    'Whether luckperms db pool is connected',
  );
  private readonly queryHistogram = getOrCreateHistogram(
    'luckperms_db_query_time_ms',
    'LuckPerms db query latency',
    ['method'],
  );

  constructor() {
    ensureDefaultMetricsCollected();
  }

  setConnected(connected: boolean) {
    this.connectedGauge.set(connected ? 1 : 0);
  }

  observeQuery(method: string, durationMs: number) {
    this.queryHistogram.labels({ method }).observe(durationMs);
  }
}
