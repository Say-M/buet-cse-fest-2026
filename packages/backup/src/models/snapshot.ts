import mongoose, { Schema, Document } from "mongoose";

/**
 * Snapshot - Point-in-time database snapshot metadata
 *
 * Represents a consistent point-in-time view of the database.
 * The actual data is stored in snapshot collections or exported files.
 */

export type SnapshotStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "backed_up";

export interface ICollectionSnapshot {
  /** Collection name */
  name: string;
  /** Number of documents in collection at snapshot time */
  documentCount: number;
  /** Size in bytes (approximate) */
  sizeBytes: number;
  /** Checksum of collection data */
  checksum: string;
}

export interface ISnapshot extends Document {
  /** Unique snapshot identifier */
  snapshotId: string;
  /** Human-readable name */
  name: string;
  /** When snapshot was created */
  createdAt: Date;
  /** When snapshot completed */
  completedAt: Date | null;
  /** Current status */
  status: SnapshotStatus;
  /** Database being snapshotted */
  database: string;
  /** Collections included in snapshot */
  collections: ICollectionSnapshot[];
  /** Last WAL sequence number included in this snapshot */
  lastWALSequenceNumber: number;
  /** Total size of snapshot in bytes */
  totalSizeBytes: number;
  /** Whether this snapshot has been sent to external backup service */
  backedUpToExternal: boolean;
  /** When backed up to external service */
  externalBackupAt: Date | null;
  /** External backup reference/ID */
  externalBackupRef: string | null;
  /** Error message if failed */
  errorMessage: string | null;
  /** Metadata for recovery */
  metadata: {
    mongoVersion: string;
    nodeVersion: string;
    serviceName: string;
  };
}

const collectionSnapshotSchema = new Schema<ICollectionSnapshot>(
  {
    name: { type: String, required: true },
    documentCount: { type: Number, required: true },
    sizeBytes: { type: Number, required: true },
    checksum: { type: String, required: true },
  },
  { _id: false },
);

const snapshotSchema = new Schema<ISnapshot>(
  {
    snapshotId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      required: true,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "in_progress", "completed", "failed", "backed_up"],
      index: true,
    },
    database: {
      type: String,
      required: true,
    },
    collections: {
      type: [collectionSnapshotSchema],
      default: [],
    },
    lastWALSequenceNumber: {
      type: Number,
      required: true,
      index: true,
    },
    totalSizeBytes: {
      type: Number,
      default: 0,
    },
    backedUpToExternal: {
      type: Boolean,
      default: false,
      index: true,
    },
    externalBackupAt: {
      type: Date,
      default: null,
    },
    externalBackupRef: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    metadata: {
      mongoVersion: { type: String, required: true },
      nodeVersion: { type: String, required: true },
      serviceName: { type: String, required: true },
    },
  },
  {
    timestamps: false,
    collection: "_snapshots",
  },
);

// Index for finding latest completed snapshot
snapshotSchema.index({ status: 1, createdAt: -1 });

export const Snapshot = mongoose.model<ISnapshot>("Snapshot", snapshotSchema);
