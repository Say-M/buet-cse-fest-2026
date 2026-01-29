/** @format */

import { Hono } from "hono";
import { analyticsService } from "../services/analytics.service";

const analytics = new Hono();

// Get metrics
analytics.get("/metrics", (c) => {
  return c.json(analyticsService.getMetrics());
});

// Reset metrics (for testing)
analytics.post("/metrics/reset", (c) => {
  analyticsService.reset();
  return c.json({ success: true, message: "Metrics reset" });
});

export default analytics;
