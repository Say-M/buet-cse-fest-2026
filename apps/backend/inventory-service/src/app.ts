import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { secureHeaders } from "hono/secure-headers";
import { cors } from "hono/cors";
import { Scalar } from "@scalar/hono-api-reference";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { openAPIRouteHandler } from "hono-openapi";
import { PinoLogger, pinoLogger } from "hono-pino";
import { pino } from "pino";
import { requestId } from "hono/request-id";
import { prometheus } from "@hono/prometheus";
import { collectDefaultMetrics, register, Gauge, Counter } from "prom-client";

const { registerMetrics } = prometheus();

collectDefaultMetrics({ register });

// Custom metrics for gremlin latency
export const gremlinDelaysCounter = new Counter({
  name: "inventory_gremlin_delays_total",
  help: "Total number of gremlin latency delays applied",
  registers: [register],
});

export const gremlinDelayDuration = new Gauge({
  name: "inventory_gremlin_delay_seconds",
  help: "Last gremlin delay duration in seconds",
  registers: [register],
});

// Initialize metrics
gremlinDelayDuration.set(0);

export interface AppBindings {
  Variables: {
    logger: PinoLogger;
  };
}

const app = new Hono<AppBindings>();

// Prometheus metrics
app.use("*", registerMetrics);
app.get("/metrics", async (c) => {
  c.header("Content-Type", register.contentType);
  return c.text(await register.metrics());
});

// Request ID
app.use(requestId());

// Logging with Loki transport
const lokiUrl = process.env.LOKI_URL || "http://localhost:3100";
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    targets: [
      {
        target: "pino-pretty",
        level: process.env.LOG_LEVEL || "info",
        options: { colorize: true },
      },
      {
        target: "pino-loki",
        level: process.env.LOG_LEVEL || "info",
        options: {
          batching: true,
          interval: 5,
          host: lokiUrl,
          labels: { job: "inventory-service", app: "valerix" },
        },
      },
    ],
  },
});

app.use(pinoLogger({ pino: logger }));

// Security headers
app.use(secureHeaders());

// Error handling
app.onError((error, c) => {
  c.var.logger.error(error);
  let status: ContentfulStatusCode = 500;
  let message = "Internal server error";
  const timestamp = new Date().toISOString();

  if (error instanceof HTTPException) {
    status = error.status;
    message = error.message;
  } else if (error instanceof ZodError) {
    message = error.message;
    status = 400;
  } else {
    message = error?.message || "Internal server error";
    status = 500;
  }

  return c.json({ message, error: error.message, timestamp }, status);
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      message: "Not found",
      timestamp: new Date().toISOString(),
    },
    404,
  );
});

// CORS
app.use(
  "*",
  cors({
    origin: process.env?.CORS_ORIGINS?.split(",") || ["*"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Type", "Authorization", "X-Gremlin-Delay-Ms"],
    credentials: true,
  }),
);

// OpenAPI documentation
app.get(
  "/openapi",
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: "Inventory Service API",
        version: "1.0.0",
        description:
          "Inventory management service with gremlin latency simulation",
      },
      servers: [
        {
          url: process.env.SERVER_URL || "http://localhost:3002",
          description: "Local Server",
        },
      ],
    },
  }),
);

// Scalar API Reference
app.get("/docs", Scalar({ url: "/openapi", theme: "purple" }));

export default app;
