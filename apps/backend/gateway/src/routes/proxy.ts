/** @format */

import { Hono } from "hono";
import { createProxyMiddleware } from "../middleware/proxy";

const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://localhost:3001";
const INVENTORY_SERVICE_URL =
  process.env.INVENTORY_SERVICE_URL || "http://localhost:3002";
const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://localhost:9000";

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

export default proxyRoutes;
