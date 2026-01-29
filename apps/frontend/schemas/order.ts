import { z } from "zod";

export const orderItemSchema = z.object({
  inventoryId: z.string().min(1, "Inventory ID is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
});

export type OrderItemSchemaType = z.infer<typeof orderItemSchema>;

export const orderCreateSchema = z.object({
  customerName: z
    .string()
    .min(2, "Customer name must be at least 2 characters"),
  customerEmail: z.email("Invalid email address"),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  shippingAddress: z
    .string()
    .min(10, "Shipping address must be at least 10 characters"),
  paymentMethod: z.string().min(1, "Payment method is required"),
});

export type OrderCreateSchemaType = z.infer<typeof orderCreateSchema>;

// Schema for updating order status
export enum OrderStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
}
export const orderStatusUpdateSchema = z.object({
  status: z.enum(OrderStatus),
});

export type OrderStatusUpdateSchemaType = z.infer<
  typeof orderStatusUpdateSchema
>;
