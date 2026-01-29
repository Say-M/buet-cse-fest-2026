/** @format */

// Initialize telemetry FIRST - before any other imports
import { initTelemetry } from "@repo/telemetry";
initTelemetry({
  serviceName: "order-service",
  serviceVersion: "1.0.0",
});

import app, { circuitBreakerState, outboxEventsPending } from "./app";
import ordersRoutes from "./routes/orders";
import healthRoutes from "./routes/health";
import connectDB from "@repo/common/db/mongo";
import {
  startOutboxWorker,
  stopOutboxWorker,
  getPendingEventCount,
} from "./workers/outbox.worker";
import { getCircuitBreakerStats } from "./services/inventory.client";

// Connect to MongoDB
await connectDB();

// Start outbox worker (with retry)
const startWorkerWithRetry = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await startOutboxWorker();
      console.log("[OrderService] Outbox worker started successfully");
      return;
    } catch (error) {
      console.error(
        `[OrderService] Failed to start outbox worker (attempt ${i + 1}/${retries}):`,
        error,
      );
      if (i < retries - 1) {
        console.log(`[OrderService] Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.warn(
    "[OrderService] Could not start outbox worker after all retries. Will retry on demand.",
  );
};

// Start worker in background
startWorkerWithRetry();

// Mount routes
app.route("/orders", ordersRoutes);
app.route("/health", healthRoutes);

// Update metrics periodically
setInterval(async () => {
  // Update circuit breaker state metric
  const cbStats = getCircuitBreakerStats();
  const stateValue =
    cbStats.state === "CLOSED" ? 0 : cbStats.state === "OPEN" ? 1 : 2;
  circuitBreakerState.set({ service: "inventory" }, stateValue);

  // Update pending outbox events metric
  try {
    const pendingCount = await getPendingEventCount();
    outboxEventsPending.set(pendingCount);
  } catch (error) {
    // Ignore errors in metrics collection
  }
}, 5000);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[OrderService] SIGTERM received, shutting down...");
  await stopOutboxWorker();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[OrderService] SIGINT received, shutting down...");
  await stopOutboxWorker();
  process.exit(0);
});

const port = process.env.PORT || 3001;

console.log(`[OrderService] Starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
