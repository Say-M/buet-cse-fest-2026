/** @format */

import app from "./app";
import healthRoutes from "./routes/health";
import analyticsRoutes from "./routes/analytics";
import { startOrderConsumer, stopOrderConsumer } from "./consumers/order.consumer";

// Health routes
app.route("/health", healthRoutes);

// Analytics routes
app.route("/analytics", analyticsRoutes);

const port = process.env.PORT || 3005;

// Start RabbitMQ consumer
startOrderConsumer().catch((error) => {
  console.error("[Analytics] Failed to start consumer:", error);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[Analytics] Shutting down gracefully...");
  await stopOrderConsumer();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[Analytics] Shutting down gracefully...");
  await stopOrderConsumer();
  process.exit(0);
});

console.log(`[Analytics] Starting analytics-service on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
