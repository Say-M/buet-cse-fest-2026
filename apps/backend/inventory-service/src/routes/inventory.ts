/** @format */

import { Hono } from "hono";
import { describeRoute, resolver, validator as zValidator } from "hono-openapi";
import type { OpenAPIV3_1 } from "openapi-types";
import { z } from "zod";
import { inventoryService } from "../services/inventory.service";
import {
  maybeApplyGremlinLatencyDeterministic,
  getGremlinStats,
} from "../lib/gremlin";
import {
  productIdParamSchema,
  inventoryResponseSchema,
  reserveStockSchema,
  reserveResponseSchema,
  createInventorySchema,
} from "../schemas/inventory";
import type { AppBindings } from "../app";

/** Assert resolver result for OpenAPI content schema (runtime uses resolver; types expect SchemaObject). */
const schema = (s: Parameters<typeof resolver>[0]) =>
  resolver(s) as unknown as OpenAPIV3_1.SchemaObject;

const inventoryRoutes = new Hono<AppBindings>();

// Get all inventory items
inventoryRoutes.get(
  "/",
  describeRoute({
    tags: ["Inventory"],
    summary: "Get all inventory items",
    responses: {
      200: {
        description: "List of inventory items",
        content: {
          "application/json": {
            schema: schema(z.array(inventoryResponseSchema)),
          },
        },
      },
    },
  }),
  async (c) => {
    const items = await inventoryService.getAll();
    return c.json(
      items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        reservedQuantity: item.reservedQuantity,
        availableQuantity: item.quantity - item.reservedQuantity,
        price: item.price,
        updatedAt: item.updatedAt.toISOString(),
      })),
    );
  },
);

// Get inventory by product ID
inventoryRoutes.get(
  "/:productId",
  describeRoute({
    tags: ["Inventory"],
    summary: "Get inventory by product ID",
    responses: {
      200: {
        description: "Inventory item",
        content: {
          "application/json": {
            schema: schema(inventoryResponseSchema),
          },
        },
      },
      404: { description: "Product not found" },
    },
  }),
  zValidator("param", productIdParamSchema),
  async (c) => {
    // Apply deterministic gremlin latency based on request ID
    const requestId = c.get("requestId") as string;
    const delayApplied = await maybeApplyGremlinLatencyDeterministic(requestId);
    if (delayApplied > 0) {
      c.header("X-Gremlin-Delay-Ms", delayApplied.toString());
    }

    const { productId } = c.req.valid("param");
    const item = await inventoryService.getByProductId(productId);

    if (!item) {
      return c.json({ error: "Product not found" }, 404);
    }

    return c.json({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      reservedQuantity: item.reservedQuantity,
      availableQuantity: item.quantity - item.reservedQuantity,
      price: item.price,
      updatedAt: item.updatedAt.toISOString(),
    });
  },
);

// Reserve stock for an order
inventoryRoutes.post(
  "/:productId/reserve",
  describeRoute({
    tags: ["Inventory"],
    summary: "Reserve stock for an order",
    description:
      "Reserves stock for an order. This endpoint may experience gremlin latency.",
    responses: {
      200: {
        description: "Stock reserved successfully",
        content: {
          "application/json": {
            schema: schema(reserveResponseSchema),
          },
        },
      },
      400: { description: "Insufficient stock or validation error" },
      404: { description: "Product not found" },
    },
  }),
  zValidator("param", productIdParamSchema),
  zValidator("json", reserveStockSchema),
  async (c) => {
    const { productId } = c.req.valid("param");
    const { quantity, adjustmentRequestId } = c.req.valid("json");
    const requestId = c.get("requestId") as string;

    // Apply deterministic gremlin latency based on request ID
    const delayApplied = await maybeApplyGremlinLatencyDeterministic(requestId);
    if (delayApplied > 0) {
      c.header("X-Gremlin-Delay-Ms", delayApplied.toString());
    }

    // Check idempotency first
    if (adjustmentRequestId) {
      const existing = await inventoryService.getProcessedRequest(
        adjustmentRequestId,
        "reserve",
      );

      if (existing && existing.result) {
        console.log(
          `[Inventory] Returning cached result for adjustmentRequestId: ${adjustmentRequestId}`,
        );
        c.header("X-Cache-Hit", "true");
        return c.json(existing.result);
      }
    }

    const result = await inventoryService.reserveStock(
      productId,
      quantity,
      requestId,
      adjustmentRequestId,
    );

    if (!result.success) {
      const status = result.inventory ? 400 : 404;
      const response = {
        success: false,
        productId,
        reservedQuantity: 0,
        remainingStock: result.inventory
          ? result.inventory.quantity - result.inventory.reservedQuantity
          : 0,
        message: result.message,
      };

      // Cache failure result too (if adjustmentRequestId provided)
      if (adjustmentRequestId) {
        try {
          await inventoryService
            .processEventIdempotently(
              `reserve-${requestId}`,
              adjustmentRequestId,
              "reserve",
              async () => response,
            )
            .catch(() => {
              /* Ignore cache errors */
            });
        } catch (e) {
          /* Ignore cache errors */
        }
      }

      return c.json(response, status);
    }

    const response = {
      success: true,
      productId,
      reservedQuantity: quantity,
      remainingStock:
        result.inventory!.quantity - result.inventory!.reservedQuantity,
      message: result.message,
    };

    // Cache success result (if adjustmentRequestId provided)
    if (adjustmentRequestId) {
      try {
        await inventoryService
          .processEventIdempotently(
            `reserve-${requestId}`,
            adjustmentRequestId,
            "reserve",
            async () => response,
          )
          .catch(() => {
            /* Ignore cache errors */
          });
      } catch (e) {
        /* Ignore cache errors */
      }
    }

    return c.json(response);
  },
);

// Release reserved stock
inventoryRoutes.post(
  "/:productId/release",
  describeRoute({
    tags: ["Inventory"],
    summary: "Release reserved stock",
    responses: {
      200: {
        description: "Stock released successfully",
        content: {
          "application/json": {
            schema: schema(reserveResponseSchema),
          },
        },
      },
      400: { description: "Failed to release stock" },
    },
  }),
  zValidator("param", productIdParamSchema),
  zValidator("json", reserveStockSchema),
  async (c) => {
    const { productId } = c.req.valid("param");
    const { quantity } = c.req.valid("json");

    const result = await inventoryService.releaseStock(productId, quantity);

    if (!result.success) {
      return c.json(
        {
          success: false,
          productId,
          reservedQuantity: 0,
          remainingStock: 0,
          message: result.message,
        },
        400,
      );
    }

    return c.json({
      success: true,
      productId,
      reservedQuantity: -quantity,
      remainingStock:
        result.inventory!.quantity - result.inventory!.reservedQuantity,
      message: result.message,
    });
  },
);

// Create inventory item
inventoryRoutes.post(
  "/",
  describeRoute({
    tags: ["Inventory"],
    summary: "Create a new inventory item",
    responses: {
      201: {
        description: "Inventory item created",
        content: {
          "application/json": {
            schema: schema(inventoryResponseSchema),
          },
        },
      },
      400: { description: "Validation error or product already exists" },
    },
  }),
  zValidator("json", createInventorySchema),
  async (c) => {
    const data = c.req.valid("json");

    // Check if product already exists
    const existing = await inventoryService.getByProductId(data.productId);
    if (existing) {
      return c.json({ error: "Product already exists" }, 400);
    }

    const item = await inventoryService.create(data);

    return c.json(
      {
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        reservedQuantity: item.reservedQuantity,
        availableQuantity: item.quantity - item.reservedQuantity,
        price: item.price,
        updatedAt: item.updatedAt.toISOString(),
      },
      201,
    );
  },
);

// Get gremlin stats
inventoryRoutes.get(
  "/debug/gremlin",
  describeRoute({
    tags: ["Debug"],
    summary: "Get gremlin latency statistics",
    responses: {
      200: { description: "Gremlin statistics" },
    },
  }),
  async (c) => {
    return c.json(getGremlinStats());
  },
);

export default inventoryRoutes;
