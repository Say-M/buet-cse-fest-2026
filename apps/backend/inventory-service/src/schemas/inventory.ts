import { z } from "zod";

export const productIdParamSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
});

export const inventoryResponseSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  quantity: z.number().int(),
  reservedQuantity: z.number().int(),
  availableQuantity: z.number().int(),
  price: z.number().nonnegative(),
  updatedAt: z.string().datetime(),
});

export const reserveStockSchema = z.object({
  quantity: z.number().int().positive("Quantity must be positive"),
  orderId: z.string().optional(),
  adjustmentRequestId: z.string().uuid().optional(),
});

export const reserveResponseSchema = z.object({
  success: z.boolean(),
  productId: z.string(),
  reservedQuantity: z.number().int(),
  remainingStock: z.number().int(),
  message: z.string(),
});

export const createInventorySchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  productName: z.string().min(1, "Product name is required"),
  quantity: z.number().int().nonnegative("Quantity must be non-negative"),
  price: z.number().nonnegative("Price must be non-negative"),
});

export const updateInventorySchema = z.object({
  quantity: z
    .number()
    .int()
    .nonnegative("Quantity must be non-negative")
    .optional(),
  productName: z.string().min(1).optional(),
  price: z.number().nonnegative("Price must be non-negative").optional(),
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
    rabbitmq: z
      .object({
        status: z.enum(["healthy", "unhealthy"]),
        error: z.string().optional(),
      })
      .optional(),
  }),
});

export type ProductIdParam = z.infer<typeof productIdParamSchema>;
export type InventoryResponse = z.infer<typeof inventoryResponseSchema>;
export type ReserveStockInput = z.infer<typeof reserveStockSchema>;
export type ReserveResponse = z.infer<typeof reserveResponseSchema>;
export type CreateInventoryInput = z.infer<typeof createInventorySchema>;
export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
