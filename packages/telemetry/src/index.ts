/** @format */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  otlpEndpoint?: string;
  enableTracing?: boolean;
  enableMetrics?: boolean;
  enableLogs?: boolean;
  debug?: boolean;
}

const DEFAULT_CONFIG: Partial<TelemetryConfig> = {
  serviceVersion: "1.0.0",
  otlpEndpoint:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318",
  enableTracing: true,
  enableMetrics: true,
  enableLogs: true,
  debug: process.env.OTEL_DEBUG === "true",
};

let sdk: NodeSDK | null = null;
let loggerProvider: LoggerProvider | null = null;

/**
 * Initialize OpenTelemetry SDK with auto-instrumentation
 */
export function initTelemetry(config: TelemetryConfig): void {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  if (sdk) {
    console.warn("[Telemetry] Already initialized, skipping");
    return;
  }

  // Enable debug logging if requested
  if (mergedConfig.debug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: mergedConfig.serviceName,
    [ATTR_SERVICE_VERSION]: mergedConfig.serviceVersion!,
  });

  // Configure exporters
  const traceExporter = mergedConfig.enableTracing
    ? new OTLPTraceExporter({
        url: `${mergedConfig.otlpEndpoint}/v1/traces`,
      })
    : undefined;

  const metricReader = mergedConfig.enableMetrics
    ? new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${mergedConfig.otlpEndpoint}/v1/metrics`,
        }),
        exportIntervalMillis: 10000, // Export every 10 seconds
      })
    : undefined;

  // Configure log exporter
  if (mergedConfig.enableLogs) {
    const logExporter = new OTLPLogExporter({
      url: `${mergedConfig.otlpEndpoint}/v1/logs`,
    });

    loggerProvider = new LoggerProvider({ resource });
    loggerProvider.addLogRecordProcessor(
      new BatchLogRecordProcessor(logExporter),
    );
  }

  // Initialize SDK
  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation to reduce noise
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // Configure HTTP instrumentation
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingPaths: [
            "/health",
            "/health/live",
            "/health/ready",
            "/metrics",
          ],
        },
      }),
    ],
  });

  // Start the SDK
  sdk.start();

  // Handle graceful shutdown
  process.on("SIGTERM", () => shutdown());
  process.on("SIGINT", () => shutdown());

  console.log(
    `[Telemetry] Initialized for ${mergedConfig.serviceName} -> ${mergedConfig.otlpEndpoint}`,
  );
}

/**
 * Shutdown the telemetry SDK gracefully
 */
export async function shutdown(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      console.log("[Telemetry] SDK shut down successfully");
    } catch (error) {
      console.error("[Telemetry] Error during shutdown:", error);
    }
  }

  if (loggerProvider) {
    try {
      await loggerProvider.shutdown();
      console.log("[Telemetry] Logger provider shut down successfully");
    } catch (error) {
      console.error("[Telemetry] Error during logger shutdown:", error);
    }
  }
}

export { createLogger, type Logger } from "./logger";
export { createMetrics, type MetricsHelper } from "./metrics";
