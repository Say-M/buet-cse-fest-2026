import app from "./app";
import { describeRoute, resolver } from "hono-openapi";
import type { OpenAPIV3_1 } from "openapi-types";
import { responseSchema } from "@repo/common/schemas/response";

/** Assert resolver result for OpenAPI content schema (runtime uses resolver; types expect SchemaObject). */
const schema = (s: Parameters<typeof resolver>[0]) =>
  resolver(s) as unknown as OpenAPIV3_1.SchemaObject;
import authRoutes from "./routes/auth";
import connectDB from "@repo/common/db/mongo";

await connectDB();

app.get(
  "/health",
  describeRoute({
    tags: ["Health"],
    summary: "Health check",
    description: "Check if the server is running",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: schema(
              responseSchema.pick({
                status: true,
                message: true,
                timestamp: true,
              }),
            ),
          },
        },
      },
    },
  }),
  (c) => {
    return c.json(
      { status: 200, message: "OK", timestamp: new Date().toISOString() },
      200,
    );
  },
);

app.route("/", authRoutes);

const port = process.env.PORT || 9000;

export default {
  port,
  fetch: app.fetch,
};
