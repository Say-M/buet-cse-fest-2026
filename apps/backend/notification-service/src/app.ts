/** @format */

import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

// CORS middleware
app.use("*", cors());

// Simple stats tracking
export const stats = {
  totalNotifications: 0,
  emailsSent: 0,
  smsSent: 0,
};

export default app;
