import mongoose, { Schema, Document } from "mongoose";

export interface IIdempotencyKey extends Document {
  key: string;
  requestHash: string;
  response: {
    status: number;
    body: any;
  };
  expiresAt: Date;
  createdAt: Date;
}

const idempotencyKeySchema = new Schema<IIdempotencyKey>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    requestHash: {
      type: String,
      required: true,
    },
    response: {
      status: {
        type: Number,
        required: true,
      },
      body: {
        type: Schema.Types.Mixed,
        required: true,
      },
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// TTL index to auto-delete expired keys after 24 hours
idempotencyKeySchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }, // Expires at the expiresAt time
);

export const IdempotencyKey = mongoose.model<IIdempotencyKey>(
  "IdempotencyKey",
  idempotencyKeySchema,
);
