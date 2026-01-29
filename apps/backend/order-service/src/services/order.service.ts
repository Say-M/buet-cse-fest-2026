/** @format */

import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";
import { Order, type IOrder, type IOrderItem } from "../models/order";
import { OutboxEvent, type IOutboxEvent } from "../models/outbox";
import { IdempotencyKey } from "../models/idempotency-key";
import { checkInventory, type InventoryCheckResult } from "./inventory.client";
import type { CreateOrderInput, OrderStatus } from "../schemas/order";

export interface CreateOrderResult {
  success: boolean;
  order?: IOrder;
  message: string;
  inventoryCheck?: InventoryCheckResult;
}

/**
 * Create a hash of the request data for idempotency validation
 */
function hashRequest(data: CreateOrderInput): string {
  const normalized = JSON.stringify({
    customerId: data.customerId,
    items: data.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.price,
    })),
  });
  return createHash("sha256").update(normalized).digest("hex");
}

export class OrderService {
  /**
   * Create a new order with transactional outbox and idempotency
   *
   * Uses MongoDB transactions to ensure order and outbox event are created atomically.
   * Implements Stripe-style idempotency with response caching.
   */
  async createOrder(
    data: CreateOrderInput,
    idempotencyKey?: string,
  ): Promise<CreateOrderResult> {
    // If idempotency key provided, check the idempotency store first
    if (idempotencyKey) {
      const requestHash = hashRequest(data);

      // Check if we've seen this idempotency key before
      const existingKey = await IdempotencyKey.findOne({ key: idempotencyKey });
      if (existingKey) {
        // Validate request hash matches
        if (existingKey.requestHash !== requestHash) {
          return {
            success: false,
            message:
              "Idempotency key reused with different request parameters",
          };
        }

        // Return cached response
        const order = await Order.findOne({
          orderId: existingKey.response.body.orderId,
        });
        return {
          success: true,
          order: order || undefined,
          message: "Order already exists (idempotent - cached response)",
        };
      }

      // Claim the idempotency key atomically to prevent race conditions
      try {
        await IdempotencyKey.create({
          key: idempotencyKey,
          requestHash,
          response: {
            status: 202,
            body: { orderId: idempotencyKey, status: "pending" },
          },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        });
      } catch (error) {
        // If key already exists (race condition), fetch and return cached response
        if (
          error instanceof Error &&
          "code" in error &&
          (error as any).code === 11000
        ) {
          const key = await IdempotencyKey.findOne({ key: idempotencyKey });
          if (key) {
            const order = await Order.findOne({
              orderId: key.response.body.orderId,
            });
            return {
              success: true,
              order: order || undefined,
              message:
                "Order already exists (idempotent - race condition handled)",
            };
          }
        }
        throw error;
      }
    }

    const orderId = idempotencyKey || uuidv4();

    // Validate inventory for all items
    const inventoryChecks: InventoryCheckResult[] = [];
    for (const item of data.items) {
      const check = await checkInventory(item.productId, item.quantity);
      inventoryChecks.push(check);

      // If inventory service is unavailable, we accept the order anyway
      // The async flow will handle stock reservation
      if (!check.success) {
        console.warn(
          `[OrderService] Inventory check failed for ${item.productId}: ${check.message}`,
        );
        // Continue with order - eventual consistency
      } else if (!check.available) {
        return {
          success: false,
          message: `Insufficient stock for product ${item.productId}: ${check.message}`,
          inventoryCheck: check,
        };
      }
    }

    // Start a MongoDB session for transaction
    const session = await mongoose.startSession();

    try {
      let order: IOrder | null = null;

      await session.withTransaction(async () => {
        // Calculate total amount (using placeholder prices if not provided)
        const items: IOrderItem[] = data.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price || 99.99, // Default price if not provided
        }));

        const totalAmount = items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0,
        );

        // Create the order
        const [createdOrder] = await Order.create(
          [
            {
              orderId,
              customerId: data.customerId,
              items,
              totalAmount,
              status: "pending",
              inventoryStatus: "pending",
            },
          ],
          { session },
        );

        order = createdOrder || null;

        // Create outbox event in same transaction
        await OutboxEvent.create(
          [
            {
              eventId: uuidv4(),
              eventType: "ORDER_CREATED",
              payload: {
                orderId: order?.orderId || "",
                customerId: order?.customerId || "",
                items: order?.items || [],
                totalAmount: order?.totalAmount || 0,
              },
              status: "pending",
            },
          ],
          { session },
        );
      });

      if (!order) {
        throw new Error("Order creation failed");
      }

      // TypeScript type assertion after null check
      const createdOrder = order as IOrder;

      // Update idempotency key with actual response
      if (idempotencyKey) {
        const responseBody = {
          orderId: createdOrder.orderId,
          status: createdOrder.status,
          message: "Order created successfully",
        };

        await IdempotencyKey.updateOne(
          { key: idempotencyKey },
          {
            $set: {
              "response.status": 202,
              "response.body": responseBody,
            },
          },
        );
      }

      return {
        success: true,
        order: createdOrder,
        message: "Order created successfully",
      };
    } catch (error) {
      console.error("[OrderService] Failed to create order:", error);

      // Clean up idempotency key on failure to allow retry
      if (idempotencyKey) {
        await IdempotencyKey.deleteOne({ key: idempotencyKey }).catch((err) =>
          console.error(
            "[OrderService] Failed to clean up idempotency key:",
            err,
          ),
        );
      }

      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to create order",
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string): Promise<IOrder | null> {
    return Order.findOne({ orderId });
  }

  /**
   * Get orders by customer ID
   */
  async getOrdersByCustomerId(
    customerId: string,
    limit = 10,
    skip = 0,
  ): Promise<IOrder[]> {
    return Order.find({ customerId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
  ): Promise<IOrder | null> {
    return Order.findOneAndUpdate({ orderId }, { status }, { new: true });
  }

  /**
   * Ship an order (creates outbox event for inventory deduction)
   */
  async shipOrder(orderId: string): Promise<CreateOrderResult> {
    const session = await mongoose.startSession();

    try {
      let order: IOrder | null = null;

      await session.withTransaction(async () => {
        // Update order status
        order = await Order.findOneAndUpdate(
          { orderId, status: { $in: ["pending", "confirmed"] } },
          { status: "shipped" },
          { new: true, session },
        );

        if (!order) {
          throw new Error("Order not found or cannot be shipped");
        }

        // Create outbox event for inventory deduction
        await OutboxEvent.create(
          [
            {
              eventId: uuidv4(),
              eventType: "ORDER_SHIPPED",
              payload: {
                orderId: order?.orderId || "",
                items: order.items,
              },
              status: "pending",
            },
          ],
          { session },
        );
      });

      if (!order) {
        return {
          success: false,
          message: "Order not found or cannot be shipped",
        };
      }

      return {
        success: true,
        order,
        message: "Order shipped successfully",
      };
    } catch (error) {
      console.error("[OrderService] Failed to ship order:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to ship order",
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<CreateOrderResult> {
    const session = await mongoose.startSession();

    try {
      let order: IOrder | null = null;

      await session.withTransaction(async () => {
        order = await Order.findOneAndUpdate(
          { orderId, status: { $in: ["pending", "confirmed"] } },
          { status: "cancelled" },
          { new: true, session },
        );

        if (!order) {
          throw new Error("Order not found or cannot be cancelled");
        }

        // Create outbox event to release reserved stock
        await OutboxEvent.create(
          [
            {
              eventId: uuidv4(),
              eventType: "ORDER_CANCELLED",
              payload: {
                orderId: order.orderId,
                items: order.items,
              },
              status: "pending",
            },
          ],
          { session },
        );
      });

      if (!order) {
        return {
          success: false,
          message: "Order not found or cannot be cancelled",
        };
      }

      return {
        success: true,
        order,
        message: "Order cancelled successfully",
      };
    } catch (error) {
      console.error("[OrderService] Failed to cancel order:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to cancel order",
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get all orders (with pagination)
   */
  async getAllOrders(limit = 10, skip = 0): Promise<IOrder[]> {
    return Order.find().sort({ createdAt: -1 }).limit(limit).skip(skip);
  }

  /**
   * Confirm inventory deduction for an order
   * Called by event handlers after inventory service confirms deduction
   */
  async confirmInventoryDeduction(orderId: string): Promise<IOrder | null> {
    return Order.findOneAndUpdate(
      { orderId, status: "shipped" },
      { inventoryStatus: "confirmed" },
      { new: true },
    );
  }

  /**
   * Mark inventory adjustment as failed
   */
  async failInventoryAdjustment(orderId: string): Promise<IOrder | null> {
    return Order.findOneAndUpdate(
      { orderId },
      { inventoryStatus: "failed", status: "failed" },
      { new: true },
    );
  }

  /**
   * Get orders with pending inventory status (for monitoring)
   */
  async getOrdersWithPendingInventory(limit = 10): Promise<IOrder[]> {
    return Order.find({
      inventoryStatus: { $in: ["pending", "reserved"] },
    })
      .sort({ createdAt: 1 })
      .limit(limit);
  }
}

export const orderService = new OrderService();
