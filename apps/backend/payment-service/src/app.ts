/** @format */

import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

// CORS middleware
app.use("*", cors());

// Simple stats tracking
export const stats = {
  totalPayments: 0,
  successfulPayments: 0,
  totalAmount: 0,
};

export default app;
