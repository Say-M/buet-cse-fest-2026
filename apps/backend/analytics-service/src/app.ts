/** @format */

import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

// CORS middleware
app.use("*", cors());

export default app;
