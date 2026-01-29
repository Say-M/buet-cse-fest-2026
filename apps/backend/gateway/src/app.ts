import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { cors } from "hono/cors";
import { Scalar } from "@scalar/hono-api-reference";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { openAPIRouteHandler } from "hono-openapi";
import { describeRoute, resolver } from "hono-openapi";
import { PinoLogger, pinoLogger } from "hono-pino";
import { pino } from "pino";
import { requestId } from "hono/request-id";
import { rateLimiter } from "hono-rate-limiter";
import { prometheus } from "@hono/prometheus";
import {
  collectDefaultMetrics,
  register,
  Counter,
  Histogram,
} from "prom-client";
import { z } from "zod";

const { printMetrics, registerMetrics } = prometheus();

collectDefaultMetrics({ register });

// Custom metrics
const gatewayRequests = new Counter({
  name: "gateway_requests_total",
  help: "Total number of requests through the gateway",
  labelNames: ["method", "path", "status"],
  registers: [register],
});

const gatewayLatency = new Histogram({
  name: "gateway_request_duration_seconds",
  help: "Gateway request latency in seconds",
  labelNames: ["method", "path"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export interface AppBindings {
  Variables: {
    logger: PinoLogger;
  };
}

const app = new Hono<AppBindings>();

// Prometheus metrics
app.use("*", registerMetrics);
app.get("/metrics", printMetrics);

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
          labels: { job: "gateway", app: "valerix" },
        },
      },
    ],
  },
});

app.use(pinoLogger({ pino: logger }));

// Security headers
app.use(secureHeaders());

// Timing middleware for metrics
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = (Date.now() - start) / 1000;

  const path = c.req.path.replace(/\/[0-9a-f-]{36}/g, "/:id"); // Normalize UUIDs
  gatewayRequests.inc({
    method: c.req.method,
    path,
    status: c.res.status.toString(),
  });
  gatewayLatency.observe({ method: c.req.method, path }, duration);
});

// Error handling
app.onError((error, c) => {
  c.var.logger.error(error);
  let status: ContentfulStatusCode = 500;
  let message = "Internal server error";
  const timestamp = new Date().toISOString();

  if (error instanceof HTTPException) {
    status = error.status;
    message = error.message;
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
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Idempotency-Key",
      "X-Request-Id",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: [
      "Content-Type",
      "Authorization",
      "X-Circuit-State",
      "X-Gateway-Time-Ms",
    ],
    credentials: true,
  }),
);

// Rate limiting
app.use(
  "/api/*",
  rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    limit: 100, // 100 requests per minute
    keyGenerator: (c) =>
      c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
    handler: (c) => {
      return c.json(
        {
          error: "Too Many Requests",
          message: "Rate limit exceeded. Please try again later.",
          retryAfter: 60,
        },
        429,
      );
    },
  }),
);

// Health check schema
const healthResponseSchema = z.object({
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  timestamp: z.string().datetime(),
  services: z.object({
    order: z.object({
      status: z.enum(["healthy", "unhealthy", "unreachable"]),
      latencyMs: z.number().optional(),
    }),
    inventory: z.object({
      status: z.enum(["healthy", "unhealthy", "unreachable"]),
      latencyMs: z.number().optional(),
    }),
    auth: z.object({
      status: z.enum(["healthy", "unhealthy", "unreachable"]),
      latencyMs: z.number().optional(),
    }),
  }),
});

// Gateway health check (aggregates backend service health)
app.get(
  "/health",
  describeRoute({
    tags: ["Health"],
    summary: "Gateway health check",
    description: "Aggregated health status of all backend services",
    responses: {
      200: {
        description: "All services healthy",
        content: {
          "application/json": { schema: resolver(healthResponseSchema) },
        },
      },
      503: {
        description: "One or more services unhealthy",
        content: {
          "application/json": { schema: resolver(healthResponseSchema) },
        },
      },
    },
  }),
  async (c) => {
    const ORDER_SERVICE_URL =
      process.env.ORDER_SERVICE_URL || "http://localhost:3001";
    const INVENTORY_SERVICE_URL =
      process.env.INVENTORY_SERVICE_URL || "http://localhost:3002";
    const AUTH_SERVICE_URL =
      process.env.AUTH_SERVICE_URL || "http://localhost:9000";
    const NOTIFICATION_SERVICE_URL =
      process.env.NOTIFICATION_SERVICE_URL || "http://localhost:3003";
    const PAYMENT_SERVICE_URL =
      process.env.PAYMENT_SERVICE_URL || "http://localhost:3004";
    const ANALYTICS_SERVICE_URL =
      process.env.ANALYTICS_SERVICE_URL || "http://localhost:3005";

    const checkService = async (
      url: string,
    ): Promise<{
      status: "healthy" | "unhealthy" | "unreachable";
      latencyMs?: number;
    }> => {
      try {
        const start = Date.now();
        const response = await fetch(`${url}/health/live`, {
          signal: AbortSignal.timeout(5000),
        });
        const latencyMs = Date.now() - start;

        return {
          status: response.ok ? "healthy" : "unhealthy",
          latencyMs,
        };
      } catch {
        return { status: "unreachable" };
      }
    };

    const [order, inventory, auth] = await Promise.all([
      checkService(ORDER_SERVICE_URL),
      checkService(INVENTORY_SERVICE_URL),
      checkService(AUTH_SERVICE_URL),
    ]);

    const services = { order, inventory, auth };

    // Determine overall status
    const allHealthy = Object.values(services).every(
      (s) => s.status === "healthy",
    );
    const anyUnreachable = Object.values(services).some(
      (s) => s.status === "unreachable",
    );

    const status = allHealthy
      ? "healthy"
      : anyUnreachable
        ? "unhealthy"
        : "degraded";

    const response = {
      status,
      timestamp: new Date().toISOString(),
      services,
    };

    return c.json(response, status === "healthy" ? 200 : 503);
  },
);

// Liveness probe
app.get("/health/live", (c) => {
  return c.json({ status: "alive", timestamp: new Date().toISOString() });
});

// OpenAPI documentation
app.get(
  "/openapi",
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: "API Gateway",
        version: "1.0.0",
        description: "API Gateway for e-commerce microservices",
      },
      servers: [
        {
          url: process.env.SERVER_URL || "http://localhost:3000",
          description: "Gateway",
        },
      ],
    },
  }),
);

// Scalar API Reference
app.get("/docs", Scalar({ url: "/openapi", theme: "purple" }));

export default app;
