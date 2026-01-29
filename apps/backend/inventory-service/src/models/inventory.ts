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
  eventId: string; // RabbitMQ message ID
  adjustmentRequestId?: string; // Logical operation ID
  operationType: string; // "reserve", "release", "confirm"
  result: any; // Cached result for replay
  processedAt: Date;
}

const processedEventSchema = new Schema<IProcessedEvent>({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  adjustmentRequestId: {
    type: String,
    index: true,
  },
  operationType: {
    type: String,
    required: true,
  },
  result: {
    type: Schema.Types.Mixed,
  },
  processedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

// Compound unique index: adjustmentRequestId + operationType
processedEventSchema.index(
  { adjustmentRequestId: 1, operationType: 1 },
  { unique: true, sparse: true }, // sparse allows null values
);

// TTL index to auto-delete old events after 7 days
processedEventSchema.index(
  { processedAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 },
);

export const ProcessedEvent = mongoose.model<IProcessedEvent>(
  "ProcessedEvent",
  processedEventSchema,
);
