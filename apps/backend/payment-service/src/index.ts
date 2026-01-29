/** @format */

import app, { stats } from "./app";
import healthRoutes from "./routes/health";
import paymentRoutes from "./routes/payment";
import { startOrderConsumer, stopOrderConsumer } from "./consumers/order.consumer";

// Health routes
app.route("/health", healthRoutes);

// Payment routes
app.route("/payments", paymentRoutes);

// Stats endpoint
app.get("/payments/stats", (c) => {
  return c.json({
    ...stats,
    averageAmount: stats.totalPayments > 0 ? stats.totalAmount / stats.totalPayments : 0,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

const port = process.env.PORT || 3004;

// Start RabbitMQ consumer
startOrderConsumer().catch((error) => {
  console.error("[Payment] Failed to start consumer:", error);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[Payment] Shutting down gracefully...");
  await stopOrderConsumer();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[Payment] Shutting down gracefully...");
  await stopOrderConsumer();
  process.exit(0);
});

console.log(`[Payment] Starting payment-service on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
