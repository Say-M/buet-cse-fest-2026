import { z } from "zod";

export const inventorySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.string().min(1, "Category is required"),
  quantity: z.number().min(0, "Quantity must be 0 or greater"),
  price: z.number().min(0.01, "Price must be greater than 0"),
  sku: z.string().min(1, "SKU is required"),
});

export type InventorySchemaType = z.infer<typeof inventorySchema>;

export const inventoryUpdateSchema = inventorySchema.partial();

export type InventoryUpdateSchemaType = z.infer<typeof inventoryUpdateSchema>;
