// Initialize telemetry FIRST - before any other imports
import { initTelemetry } from "@repo/telemetry";
initTelemetry({
  serviceName: "inventory-service",
  serviceVersion: "1.0.0",
});

import app from "./app";
import inventoryRoutes from "./routes/inventory";
import healthRoutes from "./routes/health";
import connectDB from "@repo/common/db/mongo";
import { inventoryService } from "./services/inventory.service";
import {
  startOrderConsumer,
  stopOrderConsumer,
} from "./consumers/order.consumer";

// Connect to MongoDB
await connectDB();

// Seed inventory with sample data
await inventoryService.seedInventory();

// Start RabbitMQ consumer (with retry)
const startConsumerWithRetry = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await startOrderConsumer();
      console.log("[InventoryService] RabbitMQ consumer started successfully");
      return;
    } catch (error) {
      console.error(
        `[InventoryService] Failed to start RabbitMQ consumer (attempt ${i + 1}/${retries}):`,
        error,
      );
      if (i < retries - 1) {
        console.log(
          `[InventoryService] Retrying in ${delay / 1000} seconds...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.warn(
    "[InventoryService] Could not connect to RabbitMQ after all retries. Service will run without message consumption.",
  );
};

// Start consumer in background (don't block service startup)
startConsumerWithRetry();

// Mount routes
app.route("/inventory", inventoryRoutes);
app.route("/health", healthRoutes);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[InventoryService] SIGTERM received, shutting down...");
  await stopOrderConsumer();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[InventoryService] SIGINT received, shutting down...");
  await stopOrderConsumer();
  process.exit(0);
});

const port = process.env.PORT || 3002;

console.log(`[InventoryService] Starting on port ${port}`);
console.log(
  `[InventoryService] Gremlin latency: ${process.env.GREMLIN_ENABLED === "true" ? "ENABLED" : "DISABLED"}`,
);

export default {
  port,
  fetch: app.fetch,
};
