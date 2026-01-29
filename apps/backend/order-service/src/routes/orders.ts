/** @format */

import { Hono } from "hono";
import { describeRoute, resolver, validator as zValidator } from "hono-openapi";
import type { OpenAPIV3_1 } from "openapi-types";
import { z } from "zod";
import { orderService } from "../services/order.service";
import { getCircuitBreakerStats } from "../services/inventory.client";
import {
  createOrderSchema,
  orderIdParamSchema,
  orderResponseSchema,
  createOrderResponseSchema,
} from "../schemas/order";
import type { AppBindings } from "../app";

/** Assert resolver result for OpenAPI content schema (runtime uses resolver; types expect SchemaObject). */
const schema = (s: Parameters<typeof resolver>[0]) =>
  resolver(s) as unknown as OpenAPIV3_1.SchemaObject;

const ordersRoutes = new Hono<AppBindings>();

// Create order
ordersRoutes.post(
  "/",
  describeRoute({
    tags: ["Orders"],
    summary: "Create a new order",
    description:
      "Creates an order with transactional outbox pattern. Uses circuit breaker for inventory checks.",
    responses: {
      202: {
        description: "Order accepted",
        content: {
          "application/json": {
            schema: schema(createOrderResponseSchema),
          },
        },
      },
      400: { description: "Validation error or insufficient stock" },
      503: { description: "Service temporarily unavailable" },
    },
  }),
  zValidator("json", createOrderSchema),
  async (c) => {
    const data = c.req.valid("json");
    const idempotencyKey =
      c.req.header("X-Idempotency-Key") || data.idempotencyKey;

    const result = await orderService.createOrder(data, idempotencyKey);

    if (!result.success) {
      // Check if it's an inventory issue
      if (result.inventoryCheck && !result.inventoryCheck.available) {
        return c.json(
          {
            orderId: "",
            status: "failed" as const,
            message: result.message,
          },
          400,
        );
      }

      return c.json(
        {
          orderId: "",
          status: "failed" as const,
          message: result.message,
        },
        500,
      );
    }

    // Add circuit breaker state to response headers
    const cbStats = getCircuitBreakerStats();
    c.header("X-Circuit-State", cbStats.state);

    return c.json(
      {
        orderId: result.order!.orderId,
        status: result.order!.status,
        message: result.message,
      },
      202,
    );
  },
);

// Get order by ID
ordersRoutes.get(
  "/:orderId",
  describeRoute({
    tags: ["Orders"],
    summary: "Get order by ID",
    responses: {
      200: {
        description: "Order found",
        content: {
          "application/json": {
            schema: schema(orderResponseSchema),
          },
        },
      },
      404: { description: "Order not found" },
    },
  }),
  zValidator("param", orderIdParamSchema),
  async (c) => {
    const { orderId } = c.req.valid("param");
    const order = await orderService.getOrderById(orderId);

    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    return c.json({
      orderId: order.orderId,
      customerId: order.customerId,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      shippingAddress: order.shippingAddress,
      paymentMethod: order.paymentMethod,
      items: order.items,
      totalAmount: order.totalAmount,
      status: order.status,
      inventoryStatus: order.inventoryStatus,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    });
  },
);

// Get all orders
ordersRoutes.get(
  "/",
  describeRoute({
    tags: ["Orders"],
    summary: "Get all orders",
    responses: {
      200: {
        description: "List of orders",
        content: {
          "application/json": {
            schema: schema(z.array(orderResponseSchema)),
          },
        },
      },
    },
  }),
  async (c) => {
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const skip = parseInt(c.req.query("skip") || "0", 10);

    const orders = await orderService.getAllOrders(limit, skip);

    return c.json(
      orders.map((order) => ({
        orderId: order.orderId,
        customerId: order.customerId,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        shippingAddress: order.shippingAddress,
        paymentMethod: order.paymentMethod,
        items: order.items,
        totalAmount: order.totalAmount,
        status: order.status,
        inventoryStatus: order.inventoryStatus,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      })),
    );
  },
);

// Ship order
ordersRoutes.post(
  "/:orderId/ship",
  describeRoute({
    tags: ["Orders"],
    summary: "Ship an order",
    description:
      "Marks order as shipped and creates outbox event for inventory deduction",
    responses: {
      200: {
        description: "Order shipped",
        content: {
          "application/json": {
            schema: schema(createOrderResponseSchema),
          },
        },
      },
      400: { description: "Order cannot be shipped" },
      404: { description: "Order not found" },
    },
  }),
  zValidator("param", orderIdParamSchema),
  async (c) => {
    const { orderId } = c.req.valid("param");
    const result = await orderService.shipOrder(orderId);

    if (!result.success) {
      return c.json(
        {
          orderId,
          status: "failed" as const,
          message: result.message,
        },
        result.message.includes("not found") ? 404 : 400,
      );
    }

    return c.json({
      orderId: result.order!.orderId,
      status: result.order!.status,
      message: result.message,
    });
  },
);

// Cancel order
ordersRoutes.post(
  "/:orderId/cancel",
  describeRoute({
    tags: ["Orders"],
    summary: "Cancel an order",
    description:
      "Cancels order and creates outbox event to release reserved stock",
    responses: {
      200: {
        description: "Order cancelled",
        content: {
          "application/json": {
            schema: schema(createOrderResponseSchema),
          },
        },
      },
      400: { description: "Order cannot be cancelled" },
      404: { description: "Order not found" },
    },
  }),
  zValidator("param", orderIdParamSchema),
  async (c) => {
    const { orderId } = c.req.valid("param");
    const result = await orderService.cancelOrder(orderId);

    if (!result.success) {
      return c.json(
        {
          orderId,
          status: "failed" as const,
          message: result.message,
        },
        result.message.includes("not found") ? 404 : 400,
      );
    }

    return c.json({
      orderId: result.order!.orderId,
      status: result.order!.status,
      message: result.message,
    });
  },
);

// Get circuit breaker stats (debug endpoint)
ordersRoutes.get(
  "/debug/circuit-breaker",
  describeRoute({
    tags: ["Debug"],
    summary: "Get circuit breaker statistics",
    responses: {
      200: { description: "Circuit breaker stats" },
    },
  }),
  async (c) => {
    return c.json(getCircuitBreakerStats());
  },
);

export default ordersRoutes;
