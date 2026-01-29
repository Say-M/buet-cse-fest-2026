import mongoose, { Schema, Document } from "mongoose";

export interface IOutboxEvent extends Document {
  eventId: string;
  eventType: "ORDER_CREATED" | "ORDER_SHIPPED" | "ORDER_CANCELLED";
  payload: Record<string, unknown>;
  status: "pending" | "published" | "failed";
  attempts: number;
  lockedBy: string | null;
  lockedUntil: Date | null;
  nextAttemptAt: Date;
  createdAt: Date;
  publishedAt: Date | null;
  lastError: string | null;
}

const outboxSchema = new Schema<IOutboxEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
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
    status: {
      type: String,
      required: true,
      enum: ["pending", "published", "failed"],
      default: "pending",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lockedBy: {
      type: String,
      default: null,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
    nextAttemptAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Index for polling pending events with lease acquisition
outboxSchema.index({ status: 1, nextAttemptAt: 1, lockedUntil: 1 });

// Index for leased event cleanup
outboxSchema.index({ lockedUntil: 1 });

// TTL index to auto-delete published events after 7 days
outboxSchema.index(
  { publishedAt: 1 },
  {
    expireAfterSeconds: 7 * 24 * 60 * 60,
    partialFilterExpression: { status: "published" },
  },
);

export const OutboxEvent = mongoose.model<IOutboxEvent>(
  "OutboxEvent",
  outboxSchema,
);
