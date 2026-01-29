import { z } from "zod";

export const orderItemSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  quantity: z.number().int().positive("Quantity must be positive"),
  price: z.number().positive("Price must be positive").optional(),
});

export const createOrderSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  idempotencyKey: z.uuid().optional(),
  customerName: z.string().min(1).optional(),
  customerEmail: z.string().email().optional(),
  shippingAddress: z.string().min(1).optional(),
  paymentMethod: z.string().min(1).optional(),
});

export const orderIdParamSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
});

export const orderStatusEnum = z.enum([
  "pending",
  "confirmed",
  "shipped",
  "failed",
  "cancelled",
]);

export const inventoryStatusEnum = z.enum([
  "pending",
  "reserved",
  "confirmed",
  "failed",
  "released",
]);

export const orderResponseSchema = z.object({
  orderId: z.string(),
  customerId: z.string(),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  shippingAddress: z.string().optional(),
  paymentMethod: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number(),
      price: z.number(),
    }),
  ),
  totalAmount: z.number(),
  status: orderStatusEnum,
  inventoryStatus: inventoryStatusEnum,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createOrderResponseSchema = z.object({
  orderId: z.string(),
  status: orderStatusEnum,
  message: z.string(),
});

export const healthResponseSchema = z.object({
  status: z.enum(["healthy", "unhealthy"]),
  timestamp: z.string().datetime(),
  checks: z.object({
    database: z.object({
      status: z.enum(["healthy", "unhealthy"]),
      latencyMs: z.number().optional(),
      error: z.string().optional(),
    }),
    rabbitmq: z.object({
      status: z.enum(["healthy", "unhealthy"]),
      error: z.string().optional(),
    }),
    inventoryService: z.object({
      status: z.enum(["healthy", "unhealthy"]),
      circuitState: z.enum(["CLOSED", "OPEN", "HALF_OPEN"]).optional(),
      error: z.string().optional(),
    }),
  }),
});

export type OrderItem = z.infer<typeof orderItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderIdParam = z.infer<typeof orderIdParamSchema>;
export type OrderStatus = z.infer<typeof orderStatusEnum>;
export type InventoryStatus = z.infer<typeof inventoryStatusEnum>;
export type OrderResponse = z.infer<typeof orderResponseSchema>;
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
