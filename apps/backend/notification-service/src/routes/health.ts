/** @format */

import { Hono } from "hono";

const health = new Hono();

health.get("/", (c) => {
  return c.json({
    status: "healthy",
    service: "notification-service",
    timestamp: new Date().toISOString(),
  });
});

health.get("/live", (c) => {
  return c.json({ status: "ok" }, 200);
});

export default health;
