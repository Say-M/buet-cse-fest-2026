/** @format */

import {
  Inventory,
  ProcessedEvent,
  type IInventory,
  type IProcessedEvent,
} from "../models/inventory";
import type {
  CreateInventoryInput,
  UpdateInventoryInput,
} from "../schemas/inventory";

export class InventoryService {
  /**
   * Get inventory item by product ID
   */
  async getByProductId(productId: string): Promise<IInventory | null> {
    return Inventory.findOne({ productId });
  }

  /**
   * Get all inventory items
   */
  async getAll(): Promise<IInventory[]> {
    return Inventory.find();
  }

  /**
   * Create a new inventory item
   */
  async create(data: CreateInventoryInput): Promise<IInventory> {
    const inventory = new Inventory({
      productId: data.productId,
      productName: data.productName,
      quantity: data.quantity,
      reservedQuantity: 0,
      price: data.price,
    });
    return inventory.save();
  }

  /**
   * Update an inventory item
   */
  async update(
    productId: string,
    data: UpdateInventoryInput,
  ): Promise<IInventory | null> {
    return Inventory.findOneAndUpdate(
      { productId },
      { $set: data },
      { new: true },
    );
  }

  /**
   * Reserve stock for an order
   * Returns true if reservation was successful
   */
  async reserveStock(
    productId: string,
    quantity: number,
    requestId?: string,
    adjustmentRequestId?: string,
  ): Promise<{
    success: boolean;
    inventory: IInventory | null;
    message: string;
  }> {
    const inventory = await Inventory.findOne({ productId });

    if (!inventory) {
      return {
        success: false,
        inventory: null,
        message: `Product ${productId} not found`,
      };
    }

    const availableQuantity = inventory.quantity - inventory.reservedQuantity;

    if (availableQuantity < quantity) {
      return {
        success: false,
        inventory,
        message: `Insufficient stock. Available: ${availableQuantity}, Requested: ${quantity}`,
      };
    }

    // Atomically reserve stock
    const updated = await Inventory.findOneAndUpdate(
      {
        productId,
        $expr: {
          $gte: [{ $subtract: ["$quantity", "$reservedQuantity"] }, quantity],
        },
      },
      { $inc: { reservedQuantity: quantity } },
      { new: true },
    );

    if (!updated) {
      return {
        success: false,
        inventory,
        message: "Failed to reserve stock - concurrent modification",
      };
    }

    // Schrödinger failure injection (if requestId provided)
    if (requestId) {
      const { maybeSchrodingerCrash } = await import("../lib/gremlin");
      if (maybeSchrodingerCrash(requestId)) {
        throw new Error("Connection dropped - Schrödinger simulation");
      }
    }

    return {
      success: true,
      inventory: updated,
      message: "Stock reserved successfully",
    };
  }

  /**
   * Release reserved stock (e.g., order cancelled)
   */
  async releaseStock(
    productId: string,
    quantity: number,
  ): Promise<{
    success: boolean;
    inventory: IInventory | null;
    message: string;
  }> {
    const updated = await Inventory.findOneAndUpdate(
      {
        productId,
        reservedQuantity: { $gte: quantity },
      },
      { $inc: { reservedQuantity: -quantity } },
      { new: true },
    );

    if (!updated) {
      return {
        success: false,
        inventory: null,
        message: "Failed to release stock",
      };
    }

    return {
      success: true,
      inventory: updated,
      message: "Stock released successfully",
    };
  }

  /**
   * Confirm stock deduction (order shipped)
   * Converts reserved stock to actual deduction
   */
  async confirmStockDeduction(
    productId: string,
    quantity: number,
  ): Promise<{
    success: boolean;
    inventory: IInventory | null;
    message: string;
  }> {
    const updated = await Inventory.findOneAndUpdate(
      {
        productId,
        reservedQuantity: { $gte: quantity },
        quantity: { $gte: quantity },
      },
      {
        $inc: {
          quantity: -quantity,
          reservedQuantity: -quantity,
        },
      },
      { new: true },
    );

    if (!updated) {
      return {
        success: false,
        inventory: null,
        message: "Failed to confirm stock deduction",
      };
    }

    return {
      success: true,
      inventory: updated,
      message: "Stock deducted successfully",
    };
  }

  /**
   * Check if an event has already been processed (idempotency)
   */
  async isEventProcessed(eventId: string): Promise<boolean> {
    const event = await ProcessedEvent.findOne({ eventId });
    return event !== null;
  }

  /**
   * Mark an event as processed
   */
  async markEventProcessed(eventId: string): Promise<void> {
    await ProcessedEvent.create({ eventId, processedAt: new Date() });
  }

  /**
   * Process an event idempotently
   */
  async processEventIdempotently<T>(
    eventId: string,
    adjustmentRequestId: string | undefined,
    operationType: string,
    processor: () => Promise<T>,
  ): Promise<{ processed: boolean; result?: T }> {
    // Check by adjustmentRequestId first (if provided)
    if (adjustmentRequestId) {
      const existing = await ProcessedEvent.findOne({
        adjustmentRequestId,
        operationType,
      });

      if (existing) {
        console.log(
          `[InventoryService] Request ${adjustmentRequestId} (${operationType}) already processed, returning cached result`,
        );
        return { processed: false, result: existing.result };
      }
    }

    // Check by eventId (fallback)
    if (await this.isEventProcessed(eventId)) {
      console.log(
        `[InventoryService] Event ${eventId} already processed, skipping`,
      );
      return { processed: false };
    }

    // Process and store
    const result = await processor();

    await ProcessedEvent.create({
      eventId,
      adjustmentRequestId,
      operationType,
      result,
      processedAt: new Date(),
    });

    return { processed: true, result };
  }

  /**
   * Get processed request by adjustmentRequestId
   */
  async getProcessedRequest(
    adjustmentRequestId: string,
    operationType: string,
  ): Promise<IProcessedEvent | null> {
    return ProcessedEvent.findOne({ adjustmentRequestId, operationType });
  }

  /**
   * Seed inventory with sample data
   */
  async seedInventory(): Promise<void> {
    const sampleProducts = [
      {
        productId: "PROD-001",
        productName: "Gaming Console",
        quantity: 100,
        price: 499.99,
      },
      {
        productId: "PROD-002",
        productName: "Wireless Controller",
        quantity: 250,
        price: 59.99,
      },
      {
        productId: "PROD-003",
        productName: "Gaming Headset",
        quantity: 150,
        price: 79.99,
      },
      {
        productId: "PROD-004",
        productName: "Gaming Mouse",
        quantity: 300,
        price: 49.99,
      },
      {
        productId: "PROD-005",
        productName: "Mechanical Keyboard",
        quantity: 200,
        price: 129.99,
      },
    ];

    for (const product of sampleProducts) {
      const exists = await Inventory.findOne({ productId: product.productId });
      if (!exists) {
        await this.create(product);
        console.log(
          `[InventoryService] Seeded product: ${product.productName}`,
        );
      }
    }
  }
}

export const inventoryService = new InventoryService();
