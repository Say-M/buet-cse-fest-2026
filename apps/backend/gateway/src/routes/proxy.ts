import { Hono } from "hono";
import { createProxyMiddleware } from "../middleware/proxy";

const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://localhost:3001";
const INVENTORY_SERVICE_URL =
  process.env.INVENTORY_SERVICE_URL || "http://localhost:3002";
const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://localhost:9000";
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || "http://localhost:3006";
const PAYMENT_SERVICE_URL =
  process.env.PAYMENT_SERVICE_URL || "http://localhost:3004";
const ANALYTICS_SERVICE_URL =
  process.env.ANALYTICS_SERVICE_URL || "http://localhost:3005";

const proxyRoutes = new Hono();

// Order Service routes
proxyRoutes.all(
  "/api/orders/*",
  createProxyMiddleware({
    target: ORDER_SERVICE_URL,
    pathRewrite: { "^/api/orders": "/orders" },
    timeout: 10000,
  }),
);

proxyRoutes.all(
  "/api/orders",
  createProxyMiddleware({
    target: ORDER_SERVICE_URL,
    pathRewrite: { "^/api/orders": "/orders" },
    timeout: 10000,
  }),
);

// Inventory Service routes
proxyRoutes.all(
  "/api/inventory/*",
  createProxyMiddleware({
    target: INVENTORY_SERVICE_URL,
    pathRewrite: { "^/api/inventory": "/inventory" },
    timeout: 10000,
  }),
);

proxyRoutes.all(
  "/api/inventory",
  createProxyMiddleware({
    target: INVENTORY_SERVICE_URL,
    pathRewrite: { "^/api/inventory": "/inventory" },
    timeout: 10000,
  }),
);

// Auth Service routes
// Auth service now mounts routes under basePath("/api/auth"),
// so we do NOT strip /api/auth here. The gateway will call
// e.g. http://auth-service/api/auth/login directly.
proxyRoutes.all(
  "/api/auth/*",
  createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    pathRewrite: { "^/api/auth": "" },
    timeout: 10000,
  }),
);

// Service health endpoints (for aggregated health check)
proxyRoutes.get("/api/services/order/health", async (c) => {
  try {
    const response = await fetch(`${ORDER_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    return c.json({ service: "order", ...data }, response.status as any);
  } catch (error) {
    return c.json(
      {
        service: "order",
        status: "unreachable",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      503,
    );
  }
});

proxyRoutes.get("/api/services/inventory/health", async (c) => {
  try {
    const response = await fetch(`${INVENTORY_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    return c.json({ service: "inventory", ...data }, response.status as any);
  } catch (error) {
    return c.json(
      {
        service: "inventory",
        status: "unreachable",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      503,
    );
  }
});

proxyRoutes.get("/api/services/auth/health", async (c) => {
  try {
    const response = await fetch(`${AUTH_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    return c.json({ service: "auth", ...data }, response.status as any);
  } catch (error) {
    return c.json(
      {
        service: "auth",
        status: "unreachable",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      503,
    );
  }
});

// ============ MODULAR EXTENSION SERVICES ============

// Notification Service routes
proxyRoutes.all(
  "/api/notifications/*",
  createProxyMiddleware({
    target: NOTIFICATION_SERVICE_URL,
    pathRewrite: { "^/api/notifications": "/notifications" },
    timeout: 10000,
  }),
);

// Payment Service routes
proxyRoutes.all(
  "/api/payments/*",
  createProxyMiddleware({
    target: PAYMENT_SERVICE_URL,
    pathRewrite: { "^/api/payments": "/payments" },
    timeout: 10000,
  }),
);

// Analytics Service routes
proxyRoutes.all(
  "/api/analytics/*",
  createProxyMiddleware({
    target: ANALYTICS_SERVICE_URL,
    pathRewrite: { "^/api/analytics": "/analytics" },
    timeout: 10000,
  }),
);

export default proxyRoutes;
