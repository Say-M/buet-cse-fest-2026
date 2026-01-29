import mongoose, { ChangeStream, ChangeStreamDocument } from "mongoose";
import { createHash } from "crypto";
import {
  WALEntry,
  type IWALEntry,
  type WALOperationType,
} from "./models/wal-entry";
import {
  getNextSequenceNumber,
  getCurrentSequenceNumber,
} from "./models/sequence-counter";

/**
 * WAL Writer Configuration
 */
export interface WALWriterConfig {
  /** Database name to watch */
  database: string;
  /** Collections to watch (empty = all collections) */
  collections?: string[];
  /** Collections to exclude from watching */
  excludeCollections?: string[];
  /** Batch size for writing WAL entries */
  batchSize?: number;
  /** Flush interval in milliseconds */
  flushIntervalMs?: number;
  /** Whether to capture full document before change (requires MongoDB 6.0+) */
  capturePreImage?: boolean;
}

export interface WALWriterStats {
  isRunning: boolean;
  totalEntriesWritten: number;
  lastSequenceNumber: number;
  lastWriteTime: Date | null;
  entriesPendingFlush: number;
  errorCount: number;
  lastError: string | null;
}

/**
 * WAL Writer - Captures database changes using MongoDB Change Streams
 *
 * This class listens to MongoDB change streams and writes all changes
 * to a Write-Ahead Log (WAL) for backup and recovery purposes.
 */
export class WALWriter {
  private config: Required<WALWriterConfig>;
  private changeStream: ChangeStream | null = null;
  private isRunning = false;
  private pendingEntries: Partial<IWALEntry>[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private stats: WALWriterStats = {
    isRunning: false,
    totalEntriesWritten: 0,
    lastSequenceNumber: 0,
    lastWriteTime: null,
    entriesPendingFlush: 0,
    errorCount: 0,
    lastError: null,
  };

  // Default collections to exclude (internal MongoDB and our own backup collections)
  private static readonly DEFAULT_EXCLUDE = [
    "_wal_entries",
    "_snapshots",
    "_sequence_counters",
    "_snapshot_data",
    "system.profile",
    "system.indexes",
  ];

  constructor(config: WALWriterConfig) {
    this.config = {
      database: config.database,
      collections: config.collections ?? [],
      excludeCollections: [
        ...WALWriter.DEFAULT_EXCLUDE,
        ...(config.excludeCollections ?? []),
      ],
      batchSize: config.batchSize ?? 100,
      flushIntervalMs: config.flushIntervalMs ?? 1000,
      capturePreImage: config.capturePreImage ?? false,
    };
  }

  /**
   * Start listening to database changes
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[WALWriter] Already running");
      return;
    }

    console.log(
      `[WALWriter] Starting WAL writer for database: ${this.config.database}`,
    );

    // Wait for database connection to be ready
    const waitForConnection = async (maxWaitMs = 30000): Promise<void> => {
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitMs) {
        if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
          return;
        }
        console.log("[WALWriter] Waiting for database connection...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      throw new Error("[WALWriter] Timeout waiting for database connection");
    };

    await waitForConnection();

    // Get the database connection
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("[WALWriter] Database connection not established");
    }

    // Build change stream pipeline
    const pipeline = this.buildPipeline();

    // Change stream options
    const options: mongoose.mongo.ChangeStreamOptions = {
      fullDocument: "updateLookup",
    };

    // Enable pre-image capture if configured (MongoDB 6.0+)
    if (this.config.capturePreImage) {
      options.fullDocumentBeforeChange = "whenAvailable";
    }

    // Create change stream on the database
    this.changeStream = db.watch(pipeline, options);

    // Handle change events
    this.changeStream.on("change", async (change: ChangeStreamDocument) => {
      await this.handleChange(change);
    });

    // Handle errors
    this.changeStream.on("error", (error) => {
      console.error("[WALWriter] Change stream error:", error);
      this.stats.errorCount++;
      this.stats.lastError = error.message;

      // Attempt to restart the change stream
      this.handleStreamError(error);
    });

    // Handle close
    this.changeStream.on("close", () => {
      console.log("[WALWriter] Change stream closed");
      this.isRunning = false;
      this.stats.isRunning = false;
    });

    // Start flush timer
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        console.error("[WALWriter] Flush error:", err);
        this.stats.errorCount++;
        this.stats.lastError = err.message;
      });
    }, this.config.flushIntervalMs);

    this.isRunning = true;
    this.stats.isRunning = true;
    this.stats.lastSequenceNumber = await getCurrentSequenceNumber();

    console.log("[WALWriter] Started successfully");
  }

  /**
   * Stop listening to database changes
   */
  async stop(): Promise<void> {
    console.log("[WALWriter] Stopping...");

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush any pending entries
    await this.flush();

    if (this.changeStream) {
      await this.changeStream.close();
      this.changeStream = null;
    }

    this.isRunning = false;
    this.stats.isRunning = false;

    console.log("[WALWriter] Stopped");
  }

  /**
   * Build the change stream aggregation pipeline
   */
  private buildPipeline(): mongoose.mongo.Document[] {
    const pipeline: mongoose.mongo.Document[] = [];

    // Filter by operation type (we care about data changes)
    pipeline.push({
      $match: {
        operationType: { $in: ["insert", "update", "replace", "delete"] },
      },
    });

    // Filter by collections if specified
    if (this.config.collections.length > 0) {
      pipeline.push({
        $match: {
          "ns.coll": { $in: this.config.collections },
        },
      });
    }

    // Exclude internal collections
    if (this.config.excludeCollections.length > 0) {
      pipeline.push({
        $match: {
          "ns.coll": { $nin: this.config.excludeCollections },
        },
      });
    }

    return pipeline;
  }

  /**
   * Handle a change stream event
   */
  private async handleChange(change: ChangeStreamDocument): Promise<void> {
    try {
      // Extract relevant information from change event
      const walEntry = await this.changeToWALEntry(change);

      if (walEntry) {
        this.pendingEntries.push(walEntry);
        this.stats.entriesPendingFlush = this.pendingEntries.length;

        // Flush if batch size reached
        if (this.pendingEntries.length >= this.config.batchSize) {
          await this.flush();
        }
      }
    } catch (error) {
      console.error("[WALWriter] Error handling change:", error);
      this.stats.errorCount++;
      this.stats.lastError =
        error instanceof Error ? error.message : "Unknown error";
    }
  }

  /**
   * Convert a change stream document to a WAL entry
   */
  private async changeToWALEntry(
    change: ChangeStreamDocument,
  ): Promise<Partial<IWALEntry> | null> {
    // Type guard for changes we care about
    if (
      change.operationType !== "insert" &&
      change.operationType !== "update" &&
      change.operationType !== "replace" &&
      change.operationType !== "delete"
    ) {
      return null;
    }

    const ns = change.ns;
    if (!ns) return null;

    // Get document ID
    const documentKey = (change as any).documentKey;
    const documentId = documentKey?._id?.toString() ?? "unknown";

    // Get full document (for insert, update lookup, replace)
    let fullDocument: Record<string, any> | null = null;
    if ("fullDocument" in change && change.fullDocument) {
      fullDocument = change.fullDocument as Record<string, any>;
    }

    // Get update description (for update operations)
    let updateDescription: IWALEntry["updateDescription"] = null;
    if (change.operationType === "update" && "updateDescription" in change) {
      const ud = (change as any).updateDescription;
      updateDescription = {
        updatedFields: ud?.updatedFields,
        removedFields: ud?.removedFields,
        truncatedArrays: ud?.truncatedArrays,
      };
    }

    // Get pre-image if available
    let fullDocumentBeforeChange: Record<string, any> | null = null;
    if (
      "fullDocumentBeforeChange" in change &&
      change.fullDocumentBeforeChange
    ) {
      fullDocumentBeforeChange = change.fullDocumentBeforeChange as Record<
        string,
        any
      >;
    }

    // Get next sequence number
    const sequenceNumber = await getNextSequenceNumber();

    // Calculate checksum for integrity
    const checksum = this.calculateChecksum({
      sequenceNumber,
      collection: ns.coll,
      operationType: change.operationType,
      documentId,
      fullDocument,
      updateDescription,
    });

    return {
      sequenceNumber,
      timestamp: new Date(),
      database: ns.db,
      collection: ns.coll,
      operationType: change.operationType as WALOperationType,
      documentId,
      fullDocument,
      updateDescription,
      fullDocumentBeforeChange,
      snapshotId: null, // Will be set by snapshot process
      backedUp: false,
      checksum,
    };
  }

  /**
   * Calculate checksum for a WAL entry
   */
  private calculateChecksum(data: Record<string, any>): string {
    const content = JSON.stringify(data, Object.keys(data).sort());
    return createHash("sha256").update(content).digest("hex").substring(0, 16);
  }

  /**
   * Flush pending entries to database
   */
  async flush(): Promise<number> {
    if (this.pendingEntries.length === 0) {
      return 0;
    }

    const entries = [...this.pendingEntries];
    this.pendingEntries = [];
    this.stats.entriesPendingFlush = 0;

    try {
      await WALEntry.insertMany(entries, { ordered: true });

      const count = entries.length;
      this.stats.totalEntriesWritten += count;
      this.stats.lastWriteTime = new Date();

      if (entries.length > 0) {
        this.stats.lastSequenceNumber =
          entries[entries.length - 1].sequenceNumber!;
      }

      console.log(`[WALWriter] Flushed ${count} WAL entries`);
      return count;
    } catch (error) {
      // On error, put entries back in queue
      this.pendingEntries = [...entries, ...this.pendingEntries];
      this.stats.entriesPendingFlush = this.pendingEntries.length;
      throw error;
    }
  }

  /**
   * Handle change stream errors
   */
  private async handleStreamError(error: Error): Promise<void> {
    console.log("[WALWriter] Attempting to restart change stream...");

    // Wait a bit before retrying
    await new Promise((resolve) => setTimeout(resolve, 5000));

    if (!this.isRunning) {
      return;
    }

    try {
      // Close existing stream if any
      if (this.changeStream) {
        await this.changeStream.close().catch(() => {});
        this.changeStream = null;
      }

      // Restart
      const db = mongoose.connection.db;
      if (!db) {
        console.error("[WALWriter] Cannot restart - no database connection");
        return;
      }

      const pipeline = this.buildPipeline();
      const options: mongoose.mongo.ChangeStreamOptions = {
        fullDocument: "updateLookup",
      };

      if (this.config.capturePreImage) {
        options.fullDocumentBeforeChange = "whenAvailable";
      }

      this.changeStream = db.watch(pipeline, options);

      this.changeStream.on("change", async (change: ChangeStreamDocument) => {
        await this.handleChange(change);
      });

      this.changeStream.on("error", (err) => {
        console.error("[WALWriter] Change stream error:", err);
        this.stats.errorCount++;
        this.stats.lastError = err.message;
        this.handleStreamError(err);
      });

      console.log("[WALWriter] Successfully restarted change stream");
    } catch (restartError) {
      console.error(
        "[WALWriter] Failed to restart change stream:",
        restartError,
      );
      this.stats.errorCount++;
      this.stats.lastError =
        restartError instanceof Error ? restartError.message : "Restart failed";

      // Try again later
      setTimeout(() => this.handleStreamError(error), 10000);
    }
  }

  /**
   * Get current statistics
   */
  getStats(): WALWriterStats {
    return { ...this.stats, entriesPendingFlush: this.pendingEntries.length };
  }

  /**
   * Check if writer is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

/**
 * Create a WAL writer instance
 */
export function createWALWriter(config: WALWriterConfig): WALWriter {
  return new WALWriter(config);
}
