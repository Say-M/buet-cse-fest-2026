/** @format */

import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import type { OpenAPIV3_1 } from "openapi-types";
import mongoose from "mongoose";
import { healthResponseSchema } from "../schemas/order";

/** Assert resolver result for OpenAPI content schema (runtime uses resolver; types expect SchemaObject). */
const schema = (s: Parameters<typeof resolver>[0]) =>
  resolver(s) as unknown as OpenAPIV3_1.SchemaObject;
import {
  checkInventoryServiceHealth,
  getCircuitState,
} from "../services/inventory.client";
import {
  isWorkerRunning,
  isRabbitMQConnected,
  getWorkerStats,
  getPendingEventCount,
} from "../workers/outbox.worker";
import type { AppBindings } from "../app";

const healthRoutes = new Hono<AppBindings>();

healthRoutes.get(
  "/",
  describeRoute({
    tags: ["Health"],
    summary: "Health check",
    description:
      "Deep health check that verifies database, RabbitMQ, and inventory service connections",
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
      inventoryService: {
        status: "healthy" | "unhealthy";
        circuitState?: "CLOSED" | "OPEN" | "HALF_OPEN";
        error?: string;
      };
    } = {
      database: { status: "unhealthy" },
      rabbitmq: { status: "unhealthy" },
      inventoryService: { status: "unhealthy" },
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

    // Check RabbitMQ connection (via outbox worker)
    if (isRabbitMQConnected()) {
      checks.rabbitmq = { status: "healthy" };
    } else {
      checks.rabbitmq = {
        status: "unhealthy",
        error: "RabbitMQ not connected",
      };
    }

    // Check Inventory Service (respects circuit breaker)
    const inventoryHealth = await checkInventoryServiceHealth();
    checks.inventoryService = {
      status: inventoryHealth.healthy ? "healthy" : "unhealthy",
      circuitState: inventoryHealth.circuitState,
      error: inventoryHealth.error,
    };

    // Overall health (database and rabbitmq must be healthy)
    // Inventory service being down doesn't make us unhealthy (circuit breaker handles it)
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

// Liveness probe
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

// Readiness probe
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
    const isRabbitReady = isRabbitMQConnected();
    const isWorkerReady = isWorkerRunning();

    if (isDbReady && isRabbitReady && isWorkerReady) {
      return c.json({ status: "ready", timestamp: new Date().toISOString() });
    }

    return c.json(
      {
        status: "not_ready",
        timestamp: new Date().toISOString(),
        database: isDbReady ? "ready" : "not_ready",
        rabbitmq: isRabbitReady ? "ready" : "not_ready",
        outboxWorker: isWorkerReady ? "ready" : "not_ready",
      },
      503,
    );
  },
);

// Outbox worker stats
healthRoutes.get(
  "/outbox",
  describeRoute({
    tags: ["Health"],
    summary: "Outbox worker statistics",
    responses: {
      200: { description: "Outbox stats" },
    },
  }),
  async (c) => {
    const stats = getWorkerStats();
    const pendingCount = await getPendingEventCount();

    return c.json({
      ...stats,
      pendingEventsInDb: pendingCount,
    });
  },
);

export default healthRoutes;
