// Initialize telemetry FIRST - before any other imports
import { initTelemetry } from "@repo/telemetry";
initTelemetry({
  serviceName: "gateway",
  serviceVersion: "1.0.0",
});

import app from "./app";
import proxyRoutes from "./routes/proxy";

// Mount proxy routes
app.route("/", proxyRoutes);

// Root endpoint
app.get("/", (c) => {
  return c.json({
    name: "E-commerce API Gateway",
    version: "1.0.0",
    documentation: "/docs",
    health: "/health",
    endpoints: {
      orders: "/api/orders",
      inventory: "/api/inventory",
      auth: "/api/auth",
    },
  });
});

const port = process.env.PORT || 3000;

console.log(`[Gateway] Starting on port ${port}`);
console.log(
  `[Gateway] Order Service: ${process.env.ORDER_SERVICE_URL || "http://localhost:3001"}`,
);
console.log(
  `[Gateway] Inventory Service: ${process.env.INVENTORY_SERVICE_URL || "http://localhost:3002"}`,
);
console.log(
  `[Gateway] Auth Service: ${process.env.AUTH_SERVICE_URL || "http://localhost:9000"}`,
);

export default {
  port,
  fetch: app.fetch,
};
