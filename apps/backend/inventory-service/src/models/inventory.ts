/** @format */

import mongoose, { Schema, Document } from "mongoose";

export interface IInventory extends Document {
  productId: string;
  productName: string;
  quantity: number;
  reservedQuantity: number;
  updatedAt: Date;
}

const inventorySchema = new Schema<IInventory>(
  {
    productId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    productName: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    reservedQuantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Virtual for available quantity
inventorySchema.virtual("availableQuantity").get(function () {
  return this.quantity - this.reservedQuantity;
});

// Ensure virtuals are included in JSON
inventorySchema.set("toJSON", { virtuals: true });
inventorySchema.set("toObject", { virtuals: true });

export const Inventory = mongoose.model<IInventory>(
  "Inventory",
  inventorySchema,
);

// Processed events collection for idempotency
export interface IProcessedEvent extends Document {
  eventId: string;
  processedAt: Date;
}

const processedEventSchema = new Schema<IProcessedEvent>({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  processedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

// TTL index to auto-delete old events after 7 days
processedEventSchema.index(
  { processedAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 },
);

export const ProcessedEvent = mongoose.model<IProcessedEvent>(
  "ProcessedEvent",
  processedEventSchema,
);
