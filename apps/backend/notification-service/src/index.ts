/** @format */

import app, { stats } from "./app";
import healthRoutes from "./routes/health";
import { startOrderConsumer, stopOrderConsumer } from "./consumers/order.consumer";

// Health routes
app.route("/health", healthRoutes);

// Stats endpoint
app.get("/notifications/stats", (c) => {
  return c.json({
    ...stats,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

const port = process.env.PORT || 3003;

// Start RabbitMQ consumer
startOrderConsumer().catch((error) => {
  console.error("[Notification] Failed to start consumer:", error);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[Notification] Shutting down gracefully...");
  await stopOrderConsumer();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[Notification] Shutting down gracefully...");
  await stopOrderConsumer();
  process.exit(0);
});

console.log(`[Notification] Starting notification-service on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
