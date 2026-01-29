import pino from "pino";
import { trace, context } from "@opentelemetry/api";

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
}

/**
 * Create a logger that automatically includes trace context
 */
export function createLogger(serviceName: string): Logger {
  const baseLogger = pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || "info",
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  });

  const withTraceContext = (data?: Record<string, unknown>) => {
    const span = trace.getSpan(context.active());
    const spanContext = span?.spanContext();

    const traceData: Record<string, unknown> = {
      service: serviceName,
      ...data,
    };

    if (spanContext) {
      traceData.traceId = spanContext.traceId;
      traceData.spanId = spanContext.spanId;
    }

    return traceData;
  };

  return {
    info(msg: string, data?: Record<string, unknown>) {
      baseLogger.info(withTraceContext(data), msg);
    },

    warn(msg: string, data?: Record<string, unknown>) {
      baseLogger.warn(withTraceContext(data), msg);
    },

    error(msg: string, data?: Record<string, unknown>) {
      baseLogger.error(withTraceContext(data), msg);
    },

    debug(msg: string, data?: Record<string, unknown>) {
      baseLogger.debug(withTraceContext(data), msg);
    },
  };
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(
  parent: Logger,
  context: Record<string, unknown>,
): Logger {
  return {
    info(msg: string, data?: Record<string, unknown>) {
      parent.info(msg, { ...context, ...data });
    },
    warn(msg: string, data?: Record<string, unknown>) {
      parent.warn(msg, { ...context, ...data });
    },
    error(msg: string, data?: Record<string, unknown>) {
      parent.error(msg, { ...context, ...data });
    },
    debug(msg: string, data?: Record<string, unknown>) {
      parent.debug(msg, { ...context, ...data });
    },
  };
}
