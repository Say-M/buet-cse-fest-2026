/** @format */

import mongoose, { Schema, Document } from "mongoose";

export interface IDeadLetterEvent extends Document {
  eventId: string;
  eventType: "ORDER_CREATED" | "ORDER_SHIPPED" | "ORDER_CANCELLED";
  payload: Record<string, unknown>;
  originalStatus: "pending" | "published" | "failed";
  attempts: number;
  lastError: string | null;
  movedAt: Date;
  reason: string;
  originalCreatedAt: Date;
}

const deadLetterEventSchema = new Schema<IDeadLetterEvent>(
  {
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: ["ORDER_CREATED", "ORDER_SHIPPED", "ORDER_CANCELLED"],
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    originalStatus: {
      type: String,
      required: true,
      enum: ["pending", "published", "failed"],
    },
    attempts: {
      type: Number,
      required: true,
    },
    lastError: {
      type: String,
      default: null,
    },
    movedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      index: true,
    },
    originalCreatedAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: false,
  },
);

// Index for querying by event type and moved date
deadLetterEventSchema.index({ eventType: 1, movedAt: -1 });

// Index for querying by reason
deadLetterEventSchema.index({ reason: 1, movedAt: -1 });

export const DeadLetterEvent = mongoose.model<IDeadLetterEvent>(
  "DeadLetterEvent",
  deadLetterEventSchema,
);
