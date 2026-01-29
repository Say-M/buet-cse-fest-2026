import mongoose, { Schema, Document } from "mongoose";

/**
 * WAL Entry - Write-Ahead Log Entry
 *
 * Captures every database change as an immutable log entry.
 * These entries can be replayed to reconstruct database state.
 */

export type WALOperationType = "insert" | "update" | "delete" | "replace";

export interface IWALEntry extends Document {
  /** Unique sequence number for ordering */
  sequenceNumber: number;
  /** Timestamp when the change occurred */
  timestamp: Date;
  /** Database name where change occurred */
  database: string;
  /** Collection name where change occurred */
  collection: string;
  /** Type of operation */
  operationType: WALOperationType;
  /** Document ID that was affected */
  documentId: string;
  /** Full document state after the change (for insert/update/replace) */
  fullDocument: Record<string, any> | null;
  /** Fields that were updated (for update operations) */
  updateDescription: {
    updatedFields?: Record<string, any>;
    removedFields?: string[];
    truncatedArrays?: Array<{ field: string; newSize: number }>;
  } | null;
  /** Document state before the change (if available) */
  fullDocumentBeforeChange: Record<string, any> | null;
  /** The snapshot this WAL entry belongs to (null if before first snapshot) */
  snapshotId: string | null;
  /** Whether this entry has been backed up to external service */
  backedUp: boolean;
  /** Checksum for integrity verification */
  checksum: string;
}

const walEntrySchema = new Schema<IWALEntry>(
  {
    sequenceNumber: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    database: {
      type: String,
      required: true,
      index: true,
    },
    collection: {
      type: String,
      required: true,
      index: true,
    },
    operationType: {
      type: String,
      required: true,
      enum: ["insert", "update", "delete", "replace"],
    },
    documentId: {
      type: String,
      required: true,
      index: true,
    },
    fullDocument: {
      type: Schema.Types.Mixed,
      default: null,
    },
    updateDescription: {
      type: Schema.Types.Mixed,
      default: null,
    },
    fullDocumentBeforeChange: {
      type: Schema.Types.Mixed,
      default: null,
    },
    snapshotId: {
      type: String,
      default: null,
      index: true,
    },
    backedUp: {
      type: Boolean,
      default: false,
      index: true,
    },
    checksum: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: false,
    // Use a separate collection for WAL entries
    collection: "_wal_entries",
  },
);

// Compound indexes for efficient queries
walEntrySchema.index({ snapshotId: 1, sequenceNumber: 1 });
walEntrySchema.index({ backedUp: 1, sequenceNumber: 1 });
walEntrySchema.index({ collection: 1, documentId: 1, sequenceNumber: 1 });

export const WALEntry = mongoose.model<IWALEntry>("WALEntry", walEntrySchema);
