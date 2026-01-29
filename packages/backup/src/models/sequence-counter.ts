import mongoose, { Schema, Document } from "mongoose";

/**
 * Sequence Counter - Atomic counter for WAL sequence numbers
 *
 * Ensures globally unique, monotonically increasing sequence numbers
 * across all WAL entries.
 */

export interface ISequenceCounter extends Document {
  /** Counter name */
  name: string;
  /** Current sequence value */
  value: number;
}

const sequenceCounterSchema = new Schema<ISequenceCounter>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    value: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    collection: "_sequence_counters",
  },
);

export const SequenceCounter = mongoose.model<ISequenceCounter>(
  "SequenceCounter",
  sequenceCounterSchema,
);

/**
 * Get next sequence number atomically
 */
export async function getNextSequenceNumber(
  counterName: string = "wal_sequence",
): Promise<number> {
  const counter = await SequenceCounter.findOneAndUpdate(
    { name: counterName },
    { $inc: { value: 1 } },
    { new: true, upsert: true },
  );

  return counter.value;
}

/**
 * Get current sequence number without incrementing
 */
export async function getCurrentSequenceNumber(
  counterName: string = "wal_sequence",
): Promise<number> {
  const counter = await SequenceCounter.findOne({ name: counterName });
  return counter?.value ?? 0;
}
