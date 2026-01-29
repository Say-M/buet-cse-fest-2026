/** @format */

import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { Scalar } from "@scalar/hono-api-reference";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { openAPIRouteHandler } from "hono-openapi";
import { PinoLogger, pinoLogger } from "hono-pino";
import { pino } from "pino";
import { requestId } from "hono/request-id";
import { UserType } from "./models/user";
import { prometheus } from "@hono/prometheus";
import { collectDefaultMetrics, register } from "prom-client";

const { printMetrics, registerMetrics } = prometheus();

collectDefaultMetrics({ register });

export interface AppBindings {
  Variables: {
    logger: PinoLogger;
    user?: UserType;
  };
}

const app = new Hono<AppBindings>();

app.use("*", registerMetrics);
app.get("/metrics", printMetrics);

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
          labels: { job: "auth-service", app: "valerix" },
        },
      },
    ],
  },
});

app.use(pinoLogger({ pino: logger }));

app.use(secureHeaders());

app.onError((error, c) => {
  c.var.logger.error(error);
  let status: ContentfulStatusCode = 500;
  let message = "Internal server error";
  const timestamp = new Date().toISOString();
  if (error instanceof HTTPException) {
    status = error.status;
    message = error.message;
    // } else if (error instanceof MongooseError) {
    //   return c.json({ message: error.message, error }, 400);
  } else if (error instanceof ZodError) {
    message = error.message;
    status = 400;
  } else {
    message = error?.message || "Internal server error";
    status = 500;
  }
  return c.json({ message, error, timestamp }, status);
});

app.notFound((c) => {
  const status = 404;
  const message = "Not found";
  const timestamp = new Date().toISOString();
  return c.json({ message, timestamp }, status);
});

app.use(
  "*",
  bodyLimit({
    maxSize: 1024 * 1024 * 10, // 10MB
    onError(c) {
      return c.json(
        {
          error: "Request body too large",
        },
        413,
      );
    },
  }),
);

app.use(
  "*",
  cors({
    origin: process.env?.CORS_ORIGINS?.split(",") || ["*"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use(
  "*",
  csrf({
    origin: process.env?.CSRF_ORIGINS?.split(",") || ["*"],
  }),
);

app.use(
  rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each client to 100 requests per window
    keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "", // Use IP address as key
  }),
);

app.get(
  "/openapi",
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: "Backend API",
        version: "1.0.0",
        description: "Backend API",
      },
      servers: [{ url: process.env.SERVER_URL!, description: "Local Server" }],
    },
  }),
);

app.get("/docs", Scalar({ url: "/openapi", theme: "purple" }));

export default app;
