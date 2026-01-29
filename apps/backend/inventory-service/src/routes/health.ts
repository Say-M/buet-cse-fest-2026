/** @format */

import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import type { OpenAPIV3_1 } from "openapi-types";
import mongoose from "mongoose";
import { healthResponseSchema } from "../schemas/inventory";

/** Assert resolver result for OpenAPI content schema (runtime uses resolver; types expect SchemaObject). */
const schema = (s: Parameters<typeof resolver>[0]) =>
  resolver(s) as unknown as OpenAPIV3_1.SchemaObject;
import { isConsumerConnected } from "../consumers/order.consumer";
import type { AppBindings } from "../app";

const healthRoutes = new Hono<AppBindings>();

healthRoutes.get(
  "/",
  describeRoute({
    tags: ["Health"],
    summary: "Health check",
    description:
      "Deep health check that verifies database and RabbitMQ connections",
    responses: {
      200: {
        description: "Service is healthy",
        content: {
          "application/json": {
            schema: schema(healthResponseSchema),
          },
        },
      },
      503: {
        description: "Service is unhealthy",
        content: {
          "application/json": {
            schema: schema(healthResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const checks: {
      database: {
        status: "healthy" | "unhealthy";
        latencyMs?: number;
        error?: string;
      };
      rabbitmq: { status: "healthy" | "unhealthy"; error?: string };
    } = {
      database: { status: "unhealthy" },
      rabbitmq: { status: "unhealthy" },
    };

    // Check MongoDB connection
    try {
      const startTime = Date.now();
      await mongoose.connection.db?.admin().ping();
      checks.database = {
        status: "healthy",
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      checks.database = {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }

    // Check RabbitMQ connection
    if (isConsumerConnected()) {
      checks.rabbitmq = { status: "healthy" };
    } else {
      checks.rabbitmq = {
        status: "unhealthy",
        error: "RabbitMQ consumer not connected",
      };
    }

    const isHealthy =
      checks.database.status === "healthy" &&
      checks.rabbitmq.status === "healthy";

    const response = {
      status: isHealthy ? ("healthy" as const) : ("unhealthy" as const),
      timestamp: new Date().toISOString(),
      checks,
    };

    return c.json(response, isHealthy ? 200 : 503);
  },
);

// Liveness probe (just checks if service is running)
healthRoutes.get(
  "/live",
  describeRoute({
    tags: ["Health"],
    summary: "Liveness probe",
    responses: {
      200: { description: "Service is alive" },
    },
  }),
  async (c) => {
    return c.json({ status: "alive", timestamp: new Date().toISOString() });
  },
);

// Readiness probe (checks if service is ready to accept traffic)
healthRoutes.get(
  "/ready",
  describeRoute({
    tags: ["Health"],
    summary: "Readiness probe",
    responses: {
      200: { description: "Service is ready" },
      503: { description: "Service is not ready" },
    },
  }),
  async (c) => {
    const isDbReady = mongoose.connection.readyState === 1;
    const isRabbitReady = isConsumerConnected();

    if (isDbReady && isRabbitReady) {
      return c.json({ status: "ready", timestamp: new Date().toISOString() });
    }

    return c.json(
      {
        status: "not_ready",
        timestamp: new Date().toISOString(),
        database: isDbReady ? "ready" : "not_ready",
        rabbitmq: isRabbitReady ? "ready" : "not_ready",
      },
      503,
    );
  },
);

export default healthRoutes;
