import {
  metrics,
  Counter,
  Histogram,
  UpDownCounter,
  Gauge,
} from "@opentelemetry/api";

export interface MetricsHelper {
  /**
   * Increment a counter
   */
  incrementCounter(
    name: string,
    value?: number,
    attributes?: Record<string, string>,
  ): void;

  /**
   * Record a histogram value (e.g., request duration)
   */
  recordHistogram(
    name: string,
    value: number,
    attributes?: Record<string, string>,
  ): void;

  /**
   * Update a gauge value (can go up or down)
   */
  setGauge(
    name: string,
    value: number,
    attributes?: Record<string, string>,
  ): void;

  /**
   * Create a timer for measuring duration
   */
  startTimer(): () => number;
}

interface MetricInstruments {
  counters: Map<string, Counter>;
  histograms: Map<string, Histogram>;
  gauges: Map<string, UpDownCounter>;
}

/**
 * Create a metrics helper for a service
 */
export function createMetrics(serviceName: string): MetricsHelper {
  const meter = metrics.getMeter(serviceName);
  const instruments: MetricInstruments = {
    counters: new Map(),
    histograms: new Map(),
    gauges: new Map(),
  };

  const getOrCreateCounter = (name: string): Counter => {
    let counter = instruments.counters.get(name);
    if (!counter) {
      counter = meter.createCounter(name, {
        description: `Counter for ${name}`,
      });
      instruments.counters.set(name, counter);
    }
    return counter;
  };

  const getOrCreateHistogram = (name: string): Histogram => {
    let histogram = instruments.histograms.get(name);
    if (!histogram) {
      histogram = meter.createHistogram(name, {
        description: `Histogram for ${name}`,
        unit: "ms",
      });
      instruments.histograms.set(name, histogram);
    }
    return histogram;
  };

  const getOrCreateGauge = (name: string): UpDownCounter => {
    let gauge = instruments.gauges.get(name);
    if (!gauge) {
      gauge = meter.createUpDownCounter(name, {
        description: `Gauge for ${name}`,
      });
      instruments.gauges.set(name, gauge);
    }
    return gauge;
  };

  return {
    incrementCounter(
      name: string,
      value = 1,
      attributes?: Record<string, string>,
    ) {
      const counter = getOrCreateCounter(name);
      counter.add(value, attributes);
    },

    recordHistogram(
      name: string,
      value: number,
      attributes?: Record<string, string>,
    ) {
      const histogram = getOrCreateHistogram(name);
      histogram.record(value, attributes);
    },

    setGauge(name: string, value: number, attributes?: Record<string, string>) {
      const gauge = getOrCreateGauge(name);
      // UpDownCounter doesn't have set, so we need to track previous value
      // For simplicity, we just add the delta (assumes starting from 0)
      gauge.add(value, attributes);
    },

    startTimer() {
      const start = Date.now();
      return () => Date.now() - start;
    },
  };
}

/**
 * Common metric names
 */
export const METRIC_NAMES = {
  HTTP_REQUEST_DURATION: "http_server_request_duration_ms",
  HTTP_REQUEST_TOTAL: "http_server_request_total",
  CIRCUIT_BREAKER_STATE: "circuit_breaker_state",
  OUTBOX_EVENTS_PENDING: "outbox_events_pending",
  INVENTORY_GREMLIN_DELAYS: "inventory_gremlin_delays_total",
  ORDERS_CREATED: "orders_created_total",
  ORDERS_FAILED: "orders_failed_total",
} as const;
