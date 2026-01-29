import mongoose from "mongoose";
import { createHash } from "crypto";
import { Snapshot, type ISnapshot } from "./models/snapshot";
import { WALEntry, type IWALEntry } from "./models/wal-entry";
import type { ExternalBackupProvider } from "./backup-service";

/**
 * Backup Package Structure (matches what BackupService creates)
 */
interface BackupPackage {
  version: string;
  type: string;
  createdAt: string;
  snapshot: {
    id: string;
    database: string;
    collections: Array<{
      name: string;
      documentCount: number;
      sizeBytes: number;
      checksum: string;
    }>;
    lastWALSequenceNumber: number;
    metadata: {
      mongoVersion: string;
      nodeVersion: string;
      serviceName: string;
    };
    data: Array<{
      snapshotId: string;
      collectionName: string;
      documents: any[];
      createdAt: string;
    }>;
  };
  wal: {
    entriesCount: number;
    firstSequence: number;
    lastSequence: number;
    entries: Array<{
      sequenceNumber: number;
      timestamp: string;
      collection: string;
      operationType: "insert" | "update" | "delete" | "replace";
      documentId: string;
      fullDocument: Record<string, any> | null;
      updateDescription: {
        updatedFields?: Record<string, any>;
        removedFields?: string[];
      } | null;
      checksum: string;
    }>;
  };
  checksum: string;
}

/**
 * Restore Service Configuration
 */
export interface RestoreServiceConfig {
  /** External backup provider for downloading backups */
  externalProvider?: ExternalBackupProvider;
  /** Whether to verify checksums during restore */
  verifyChecksums?: boolean;
  /** Whether to clear existing data before restore */
  clearExistingData?: boolean;
  /** Collections to restore (empty = all) */
  collections?: string[];
}

export interface RestoreResult {
  success: boolean;
  snapshotId: string;
  restoredCollections: string[];
  documentsRestored: number;
  walEntriesReplayed: number;
  errors: string[];
  duration: number;
}

export interface PointInTimeRestoreOptions {
  /** Target timestamp to restore to */
  targetTimestamp: Date;
  /** Snapshot ID to start from (optional - will find best match) */
  fromSnapshotId?: string;
}

/**
 * Restore Service - Restores database from snapshots and WAL entries
 *
 * Supports:
 * 1. Full restore from snapshot
 * 2. Point-in-time recovery (PITR) using WAL replay
 * 3. External backup download and restore
 * 4. Checksum verification
 */
export class RestoreService {
  private config: Required<RestoreServiceConfig>;

  constructor(config: RestoreServiceConfig = {}) {
    this.config = {
      externalProvider: config.externalProvider,
      verifyChecksums: config.verifyChecksums ?? true,
      clearExistingData: config.clearExistingData ?? false,
      collections: config.collections ?? [],
    };
  }

  /**
   * Restore from a local snapshot
   */
  async restoreFromSnapshot(snapshotId: string): Promise<RestoreResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let documentsRestored = 0;
    const restoredCollections: string[] = [];

    console.log(
      `[RestoreService] Starting restore from snapshot: ${snapshotId}`,
    );

    try {
      // Get snapshot metadata
      const snapshot = await Snapshot.findOne({ snapshotId });
      if (!snapshot) {
        throw new Error(`Snapshot not found: ${snapshotId}`);
      }

      // Get database connection
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error("Database connection not established");
      }

      // Get snapshot data
      const snapshotData = await db
        .collection("_snapshot_data")
        .find({ snapshotId })
        .toArray();

      if (snapshotData.length === 0) {
        throw new Error(`No snapshot data found for: ${snapshotId}`);
      }

      // Restore each collection
      for (const collData of snapshotData) {
        const collName = collData.collectionName;

        // Skip if collection filtering is enabled
        if (
          this.config.collections.length > 0 &&
          !this.config.collections.includes(collName)
        ) {
          continue;
        }

        try {
          const collection = db.collection(collName);

          // Verify checksum if enabled
          if (this.config.verifyChecksums) {
            const expectedChecksum = snapshot.collections.find(
              (c) => c.name === collName,
            )?.checksum;

            if (expectedChecksum) {
              const actualChecksum = this.calculateCollectionChecksum(
                collData.documents,
              );
              if (actualChecksum !== expectedChecksum) {
                errors.push(
                  `Checksum mismatch for collection ${collName}: expected ${expectedChecksum}, got ${actualChecksum}`,
                );
                continue;
              }
            }
          }

          // Clear existing data if configured
          if (this.config.clearExistingData) {
            await collection.deleteMany({});
          }

          // Restore documents
          if (collData.documents.length > 0) {
            // Use bulkWrite for efficient upserts
            const operations = collData.documents.map((doc: any) => ({
              replaceOne: {
                filter: { _id: doc._id },
                replacement: doc,
                upsert: true,
              },
            }));

            const result = await collection.bulkWrite(operations, {
              ordered: false,
            });

            documentsRestored += result.upsertedCount + result.modifiedCount;
          }

          restoredCollections.push(collName);
          console.log(
            `[RestoreService] Restored collection: ${collName} (${collData.documents.length} documents)`,
          );
        } catch (error) {
          const errorMsg = `Failed to restore collection ${collName}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          console.error(`[RestoreService] ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      const duration = Date.now() - startTime;

      console.log(
        `[RestoreService] Snapshot restore completed in ${duration}ms. Restored ${documentsRestored} documents across ${restoredCollections.length} collections`,
      );

      return {
        success: errors.length === 0,
        snapshotId,
        restoredCollections,
        documentsRestored,
        walEntriesReplayed: 0,
        errors,
        duration,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      errors.push(errorMsg);

      return {
        success: false,
        snapshotId,
        restoredCollections,
        documentsRestored,
        walEntriesReplayed: 0,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Replay WAL entries to bring database to a specific point in time
   */
  async replayWAL(
    fromSequence: number,
    toSequence?: number,
    toTimestamp?: Date,
  ): Promise<{
    entriesReplayed: number;
    errors: string[];
  }> {
    console.log(
      `[RestoreService] Replaying WAL from sequence ${fromSequence}${
        toSequence ? ` to ${toSequence}` : ""
      }${toTimestamp ? ` until ${toTimestamp.toISOString()}` : ""}`,
    );

    const errors: string[] = [];
    let entriesReplayed = 0;

    // Build query
    const query: any = {
      sequenceNumber: { $gt: fromSequence },
    };

    if (toSequence) {
      query.sequenceNumber.$lte = toSequence;
    }

    if (toTimestamp) {
      query.timestamp = { $lte: toTimestamp };
    }

    // Get WAL entries in order
    const walEntries = await WALEntry.find(query).sort({ sequenceNumber: 1 });

    console.log(
      `[RestoreService] Found ${walEntries.length} WAL entries to replay`,
    );

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not established");
    }

    // Replay each entry
    for (const entry of walEntries) {
      // Skip if collection filtering is enabled
      if (
        this.config.collections.length > 0 &&
        !this.config.collections.includes(entry.collection)
      ) {
        continue;
      }

      try {
        // Verify checksum if enabled
        if (this.config.verifyChecksums) {
          const calculatedChecksum = this.calculateEntryChecksum(entry);
          if (calculatedChecksum !== entry.checksum) {
            errors.push(
              `WAL entry ${entry.sequenceNumber} checksum mismatch: expected ${entry.checksum}, got ${calculatedChecksum}`,
            );
            continue;
          }
        }

        const collection = db.collection(entry.collection);

        switch (entry.operationType) {
          case "insert":
            if (entry.fullDocument) {
              await collection.replaceOne(
                { _id: entry.fullDocument._id },
                entry.fullDocument,
                { upsert: true },
              );
            }
            break;

          case "update":
          case "replace":
            if (entry.fullDocument) {
              await collection.replaceOne(
                { _id: entry.fullDocument._id },
                entry.fullDocument,
                { upsert: true },
              );
            } else if (entry.updateDescription) {
              const updateOps: any = {};

              if (entry.updateDescription.updatedFields) {
                updateOps.$set = entry.updateDescription.updatedFields;
              }

              if (
                entry.updateDescription.removedFields &&
                entry.updateDescription.removedFields.length > 0
              ) {
                updateOps.$unset = {};
                for (const field of entry.updateDescription.removedFields) {
                  updateOps.$unset[field] = "";
                }
              }

              if (Object.keys(updateOps).length > 0) {
                await collection.updateOne(
                  { _id: new mongoose.Types.ObjectId(entry.documentId) },
                  updateOps,
                );
              }
            }
            break;

          case "delete":
            await collection.deleteOne({
              _id: new mongoose.Types.ObjectId(entry.documentId),
            });
            break;
        }

        entriesReplayed++;
      } catch (error) {
        const errorMsg = `Failed to replay WAL entry ${entry.sequenceNumber}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
        console.error(`[RestoreService] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log(
      `[RestoreService] WAL replay completed. Replayed ${entriesReplayed} entries with ${errors.length} errors`,
    );

    return { entriesReplayed, errors };
  }

  /**
   * Point-in-time recovery - restore to a specific timestamp
   */
  async pointInTimeRestore(
    options: PointInTimeRestoreOptions,
  ): Promise<RestoreResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    console.log(
      `[RestoreService] Starting point-in-time restore to: ${options.targetTimestamp.toISOString()}`,
    );

    try {
      // Find the best snapshot to start from
      let snapshot: ISnapshot | null;

      if (options.fromSnapshotId) {
        snapshot = await Snapshot.findOne({
          snapshotId: options.fromSnapshotId,
        });
      } else {
        // Find the latest snapshot before target timestamp
        snapshot = await Snapshot.findOne({
          status: { $in: ["completed", "backed_up"] },
          createdAt: { $lte: options.targetTimestamp },
        }).sort({ createdAt: -1 });
      }

      if (!snapshot) {
        throw new Error(
          `No suitable snapshot found for point-in-time restore to ${options.targetTimestamp.toISOString()}`,
        );
      }

      console.log(`[RestoreService] Using snapshot: ${snapshot.snapshotId}`);

      // 1. Restore from snapshot
      const snapshotResult = await this.restoreFromSnapshot(
        snapshot.snapshotId,
      );
      errors.push(...snapshotResult.errors);

      // 2. Replay WAL entries up to target timestamp
      const walResult = await this.replayWAL(
        snapshot.lastWALSequenceNumber,
        undefined,
        options.targetTimestamp,
      );
      errors.push(...walResult.errors);

      const duration = Date.now() - startTime;

      console.log(
        `[RestoreService] Point-in-time restore completed in ${duration}ms`,
      );

      return {
        success: errors.length === 0,
        snapshotId: snapshot.snapshotId,
        restoredCollections: snapshotResult.restoredCollections,
        documentsRestored: snapshotResult.documentsRestored,
        walEntriesReplayed: walResult.entriesReplayed,
        errors,
        duration,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      errors.push(errorMsg);

      return {
        success: false,
        snapshotId: options.fromSnapshotId ?? "unknown",
        restoredCollections: [],
        documentsRestored: 0,
        walEntriesReplayed: 0,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Restore from external backup
   */
  async restoreFromExternal(backupRef: string): Promise<RestoreResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    console.log(
      `[RestoreService] Starting restore from external backup: ${backupRef}`,
    );

    if (!this.config.externalProvider) {
      return {
        success: false,
        snapshotId: "unknown",
        restoredCollections: [],
        documentsRestored: 0,
        walEntriesReplayed: 0,
        errors: ["No external backup provider configured"],
        duration: Date.now() - startTime,
      };
    }

    try {
      // Download backup package
      console.log(
        `[RestoreService] Downloading backup from external service...`,
      );
      const backupData = await this.config.externalProvider.download(backupRef);

      // Parse backup package
      const backupPackage: BackupPackage = JSON.parse(backupData.toString());

      // Verify checksum
      if (this.config.verifyChecksums) {
        const { checksum, ...packageWithoutChecksum } = backupPackage;
        const calculatedChecksum = createHash("sha256")
          .update(JSON.stringify(packageWithoutChecksum))
          .digest("hex");

        if (calculatedChecksum !== checksum) {
          throw new Error(
            `Backup package checksum mismatch: expected ${checksum}, got ${calculatedChecksum}`,
          );
        }
      }

      console.log(
        `[RestoreService] Backup package verified. Restoring snapshot: ${backupPackage.snapshot.id}`,
      );

      // Get database connection
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error("Database connection not established");
      }

      let documentsRestored = 0;
      const restoredCollections: string[] = [];

      // Restore snapshot data
      for (const collData of backupPackage.snapshot.data) {
        const collName = collData.collectionName;

        // Skip if collection filtering is enabled
        if (
          this.config.collections.length > 0 &&
          !this.config.collections.includes(collName)
        ) {
          continue;
        }

        try {
          const collection = db.collection(collName);

          // Clear existing data if configured
          if (this.config.clearExistingData) {
            await collection.deleteMany({});
          }

          // Restore documents
          if (collData.documents.length > 0) {
            const operations = collData.documents.map((doc: any) => ({
              replaceOne: {
                filter: { _id: doc._id },
                replacement: doc,
                upsert: true,
              },
            }));

            const result = await collection.bulkWrite(operations, {
              ordered: false,
            });

            documentsRestored += result.upsertedCount + result.modifiedCount;
          }

          restoredCollections.push(collName);
        } catch (error) {
          const errorMsg = `Failed to restore collection ${collName}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          errors.push(errorMsg);
        }
      }

      // Replay WAL entries from backup
      let walEntriesReplayed = 0;

      for (const entry of backupPackage.wal.entries) {
        // Skip if collection filtering is enabled
        if (
          this.config.collections.length > 0 &&
          !this.config.collections.includes(entry.collection)
        ) {
          continue;
        }

        try {
          const collection = db.collection(entry.collection);

          switch (entry.operationType) {
            case "insert":
            case "update":
            case "replace":
              if (entry.fullDocument) {
                await collection.replaceOne(
                  { _id: entry.fullDocument._id },
                  entry.fullDocument,
                  { upsert: true },
                );
              }
              break;

            case "delete":
              await collection.deleteOne({
                _id: new mongoose.Types.ObjectId(entry.documentId),
              });
              break;
          }

          walEntriesReplayed++;
        } catch (error) {
          const errorMsg = `Failed to replay WAL entry ${entry.sequenceNumber}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          errors.push(errorMsg);
        }
      }

      const duration = Date.now() - startTime;

      console.log(
        `[RestoreService] External restore completed in ${duration}ms`,
      );

      return {
        success: errors.length === 0,
        snapshotId: backupPackage.snapshot.id,
        restoredCollections,
        documentsRestored,
        walEntriesReplayed,
        errors,
        duration,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      errors.push(errorMsg);

      return {
        success: false,
        snapshotId: "unknown",
        restoredCollections: [],
        documentsRestored: 0,
        walEntriesReplayed: 0,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * List available restore points
   */
  async listRestorePoints(): Promise<
    Array<{
      type: "snapshot" | "wal";
      id: string;
      timestamp: Date;
      details: string;
    }>
  > {
    const restorePoints: Array<{
      type: "snapshot" | "wal";
      id: string;
      timestamp: Date;
      details: string;
    }> = [];

    // Get snapshots
    const snapshots = await Snapshot.find({
      status: { $in: ["completed", "backed_up"] },
    }).sort({ createdAt: -1 });

    for (const snapshot of snapshots) {
      restorePoints.push({
        type: "snapshot",
        id: snapshot.snapshotId,
        timestamp: snapshot.createdAt,
        details: `${snapshot.collections.length} collections, ${snapshot.totalSizeBytes} bytes`,
      });
    }

    // Get WAL boundaries
    const firstWAL = await WALEntry.findOne().sort({ sequenceNumber: 1 });
    const lastWAL = await WALEntry.findOne().sort({ sequenceNumber: -1 });

    if (firstWAL && lastWAL) {
      restorePoints.push({
        type: "wal",
        id: `wal-${firstWAL.sequenceNumber}-${lastWAL.sequenceNumber}`,
        timestamp: lastWAL.timestamp,
        details: `WAL entries ${firstWAL.sequenceNumber} to ${lastWAL.sequenceNumber}`,
      });
    }

    return restorePoints;
  }

  /**
   * Calculate checksum for a collection's documents
   */
  private calculateCollectionChecksum(documents: any[]): string {
    const content = JSON.stringify(
      documents.map((doc) => ({
        _id: doc._id?.toString(),
        ...doc,
      })),
    );
    return createHash("sha256").update(content).digest("hex").substring(0, 16);
  }

  /**
   * Calculate checksum for a WAL entry
   */
  private calculateEntryChecksum(entry: IWALEntry): string {
    const data = {
      sequenceNumber: entry.sequenceNumber,
      collection: entry.collection,
      operationType: entry.operationType,
      documentId: entry.documentId,
      fullDocument: entry.fullDocument,
      updateDescription: entry.updateDescription,
    };
    const content = JSON.stringify(data, Object.keys(data).sort());
    return createHash("sha256").update(content).digest("hex").substring(0, 16);
  }
}

/**
 * Create a restore service instance
 */
export function createRestoreService(
  config: RestoreServiceConfig = {},
): RestoreService {
  return new RestoreService(config);
}
