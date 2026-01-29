/** @format */

import mongoose from "mongoose";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  Snapshot,
  type ISnapshot,
  type ICollectionSnapshot,
} from "./models/snapshot";
import { WALEntry } from "./models/wal-entry";
import { getCurrentSequenceNumber } from "./models/sequence-counter";

/**
 * External Backup Provider Interface
 *
 * Implement this interface to integrate with your external backup service.
 * The constraint is: only ONE call per day to the external service.
 */
export interface ExternalBackupProvider {
  /**
   * Upload backup data to external service
   * This should be called only ONCE per day
   *
   * @param data - Serialized backup data (snapshot + WAL entries)
   * @param metadata - Backup metadata
   * @returns External backup reference ID
   */
  upload(
    data: Buffer | string,
    metadata: {
      snapshotId: string;
      database: string;
      timestamp: Date;
      sizeBytes: number;
      walEntriesCount: number;
    },
  ): Promise<string>;

  /**
   * Check if backup service is available
   */
  healthCheck(): Promise<boolean>;

  /**
   * Download backup data from external service
   */
  download(backupRef: string): Promise<Buffer>;
}

/**
 * Backup Service Configuration
 */
export interface BackupServiceConfig {
  /** Service name for metadata */
  serviceName: string;
  /** Database name */
  database: string;
  /** Collections to backup (empty = all) */
  collections?: string[];
  /** Collections to exclude */
  excludeCollections?: string[];
  /** External backup provider */
  externalProvider?: ExternalBackupProvider;
  /** Hour of day to run daily backup (0-23, default: 2 AM) */
  dailyBackupHour?: number;
  /** Retention period for local WAL entries in days */
  walRetentionDays?: number;
  /** Retention period for local snapshots in days */
  snapshotRetentionDays?: number;
}

export interface BackupServiceStats {
  lastSnapshotId: string | null;
  lastSnapshotTime: Date | null;
  lastExternalBackupTime: Date | null;
  totalSnapshots: number;
  totalWALEntries: number;
  pendingWALEntries: number;
  nextScheduledBackup: Date | null;
}

/**
 * Backup Service - Manages snapshots and daily external backups
 *
 * Strategy:
 * 1. Continuously capture changes via WAL Writer
 * 2. Create local snapshots periodically (or on-demand)
 * 3. Once per day, package snapshot + WAL entries and send to external service
 * 4. After successful external backup, mark WAL entries as backed up
 * 5. Clean up old snapshots and WAL entries based on retention policy
 */
export class BackupService {
  private config: Required<Omit<BackupServiceConfig, "externalProvider">> & {
    externalProvider?: ExternalBackupProvider;
  };
  private dailyBackupTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;

  // Default collections to exclude
  private static readonly DEFAULT_EXCLUDE = [
    "_wal_entries",
    "_snapshots",
    "_sequence_counters",
    "_snapshot_data",
    "system.profile",
    "system.indexes",
  ];

  constructor(config: BackupServiceConfig) {
    this.config = {
      serviceName: config.serviceName,
      database: config.database,
      collections: config.collections ?? [],
      excludeCollections: [
        ...BackupService.DEFAULT_EXCLUDE,
        ...(config.excludeCollections ?? []),
      ],
      externalProvider: config.externalProvider,
      dailyBackupHour: config.dailyBackupHour ?? 2,
      walRetentionDays: config.walRetentionDays ?? 7,
      snapshotRetentionDays: config.snapshotRetentionDays ?? 30,
    };
  }

  /**
   * Start the backup service with scheduled daily backups
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[BackupService] Already running");
      return;
    }

    console.log(
      `[BackupService] Starting backup service for ${this.config.database}`,
    );

    this.isRunning = true;

    // Schedule daily backup
    this.scheduleDailyBackup();

    console.log("[BackupService] Started successfully");
  }

  /**
   * Stop the backup service
   */
  async stop(): Promise<void> {
    console.log("[BackupService] Stopping...");

    if (this.dailyBackupTimer) {
      clearTimeout(this.dailyBackupTimer);
      this.dailyBackupTimer = null;
    }

    this.isRunning = false;
    console.log("[BackupService] Stopped");
  }

  /**
   * Schedule the next daily backup
   */
  private scheduleDailyBackup(): void {
    const now = new Date();
    const nextBackup = new Date(now);

    // Set to configured hour
    nextBackup.setHours(this.config.dailyBackupHour, 0, 0, 0);

    // If we've passed the backup hour today, schedule for tomorrow
    if (nextBackup <= now) {
      nextBackup.setDate(nextBackup.getDate() + 1);
    }

    const msUntilBackup = nextBackup.getTime() - now.getTime();

    console.log(
      `[BackupService] Next daily backup scheduled for: ${nextBackup.toISOString()}`,
    );

    this.dailyBackupTimer = setTimeout(async () => {
      try {
        await this.runDailyBackup();
      } catch (error) {
        console.error("[BackupService] Daily backup failed:", error);
      }

      // Schedule next backup
      if (this.isRunning) {
        this.scheduleDailyBackup();
      }
    }, msUntilBackup);
  }

  /**
   * Run the daily backup process
   *
   * This is the SINGLE daily call to the external backup service
   */
  async runDailyBackup(): Promise<string | null> {
    console.log("[BackupService] Starting daily backup...");

    try {
      // 1. Create a new snapshot
      const snapshot = await this.createSnapshot();

      // 2. Get all WAL entries since last backup
      const walEntries = await WALEntry.find({
        backedUp: false,
        sequenceNumber: { $lte: snapshot.lastWALSequenceNumber },
      }).sort({ sequenceNumber: 1 });

      console.log(
        `[BackupService] Packaging snapshot ${snapshot.snapshotId} with ${walEntries.length} WAL entries`,
      );

      // 3. Package data for external backup
      const backupPackage = await this.packageBackupData(snapshot, walEntries);

      // 4. Upload to external service (THE ONE DAILY CALL)
      if (this.config.externalProvider) {
        const backupRef = await this.config.externalProvider.upload(
          backupPackage.data,
          {
            snapshotId: snapshot.snapshotId,
            database: this.config.database,
            timestamp: new Date(),
            sizeBytes: backupPackage.sizeBytes,
            walEntriesCount: walEntries.length,
          },
        );

        // 5. Mark snapshot as backed up
        await Snapshot.updateOne(
          { snapshotId: snapshot.snapshotId },
          {
            $set: {
              backedUpToExternal: true,
              externalBackupAt: new Date(),
              externalBackupRef: backupRef,
              status: "backed_up",
            },
          },
        );

        // 6. Mark WAL entries as backed up
        await WALEntry.updateMany(
          {
            backedUp: false,
            sequenceNumber: { $lte: snapshot.lastWALSequenceNumber },
          },
          { $set: { backedUp: true, snapshotId: snapshot.snapshotId } },
        );

        console.log(
          `[BackupService] Daily backup completed successfully. Ref: ${backupRef}`,
        );

        // 7. Run cleanup
        await this.runCleanup();

        return backupRef;
      } else {
        // No external provider - just mark locally
        await Snapshot.updateOne(
          { snapshotId: snapshot.snapshotId },
          { $set: { status: "completed" } },
        );

        console.log(
          `[BackupService] Snapshot created locally (no external provider): ${snapshot.snapshotId}`,
        );

        return snapshot.snapshotId;
      }
    } catch (error) {
      console.error("[BackupService] Daily backup error:", error);
      throw error;
    }
  }

  /**
   * Create a database snapshot
   */
  async createSnapshot(): Promise<ISnapshot> {
    const snapshotId = `snap-${uuidv4()}`;
    const timestamp = new Date();

    console.log(`[BackupService] Creating snapshot: ${snapshotId}`);

    // Get current WAL sequence number
    const lastWALSequenceNumber = await getCurrentSequenceNumber();

    // Create pending snapshot
    const snapshot = await Snapshot.create({
      snapshotId,
      name: `Snapshot ${timestamp.toISOString()}`,
      createdAt: timestamp,
      completedAt: null,
      status: "in_progress",
      database: this.config.database,
      collections: [],
      lastWALSequenceNumber,
      totalSizeBytes: 0,
      backedUpToExternal: false,
      externalBackupAt: null,
      externalBackupRef: null,
      errorMessage: null,
      metadata: {
        mongoVersion: await this.getMongoVersion(),
        nodeVersion: process.version,
        serviceName: this.config.serviceName,
      },
    });

    try {
      // Get database connection
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error("Database connection not established");
      }

      // Get all collections in database
      const allCollections = await db.listCollections().toArray();
      const collectionSnapshots: ICollectionSnapshot[] = [];
      let totalSizeBytes = 0;

      for (const collInfo of allCollections) {
        const collName = collInfo.name;

        // Skip excluded collections
        if (this.config.excludeCollections.includes(collName)) {
          continue;
        }

        // If specific collections are configured, only include those
        if (
          this.config.collections.length > 0 &&
          !this.config.collections.includes(collName)
        ) {
          continue;
        }

        const collection = db.collection(collName);

        // Get collection stats
        const stats = await db.command({ collStats: collName }).catch(() => ({
          count: 0,
          size: 0,
        }));

        // Get all documents and calculate checksum
        const documents = await collection.find().toArray();
        const checksum = this.calculateCollectionChecksum(documents);

        const collSnapshot: ICollectionSnapshot = {
          name: collName,
          documentCount: stats.count || documents.length,
          sizeBytes: stats.size || 0,
          checksum,
        };

        collectionSnapshots.push(collSnapshot);
        totalSizeBytes += collSnapshot.sizeBytes;

        // Store snapshot data in a separate collection
        await this.storeSnapshotData(snapshotId, collName, documents);
      }

      // Update snapshot with results
      await Snapshot.updateOne(
        { snapshotId },
        {
          $set: {
            completedAt: new Date(),
            status: "completed",
            collections: collectionSnapshots,
            totalSizeBytes,
          },
        },
      );

      const updatedSnapshot = await Snapshot.findOne({ snapshotId });
      console.log(
        `[BackupService] Snapshot completed: ${snapshotId}, ${collectionSnapshots.length} collections, ${totalSizeBytes} bytes`,
      );

      return updatedSnapshot!;
    } catch (error) {
      // Mark snapshot as failed
      await Snapshot.updateOne(
        { snapshotId },
        {
          $set: {
            status: "failed",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
          },
        },
      );
      throw error;
    }
  }

  /**
   * Store snapshot data for a collection
   */
  private async storeSnapshotData(
    snapshotId: string,
    collectionName: string,
    documents: any[],
  ): Promise<void> {
    const db = mongoose.connection.db;
    if (!db) return;

    const snapshotDataCollection = db.collection("_snapshot_data");

    await snapshotDataCollection.insertOne({
      snapshotId,
      collectionName,
      documents,
      createdAt: new Date(),
    });
  }

  /**
   * Package snapshot and WAL entries for external backup
   */
  private async packageBackupData(
    snapshot: ISnapshot,
    walEntries: any[],
  ): Promise<{ data: Buffer; sizeBytes: number }> {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not established");
    }

    // Get snapshot data
    const snapshotDataCollection = db.collection("_snapshot_data");
    const snapshotData = await snapshotDataCollection
      .find({ snapshotId: snapshot.snapshotId })
      .toArray();

    // Create backup package
    const backupPackage = {
      version: "1.0",
      type: "incremental_wal_backup",
      createdAt: new Date().toISOString(),
      snapshot: {
        id: snapshot.snapshotId,
        database: snapshot.database,
        collections: snapshot.collections,
        lastWALSequenceNumber: snapshot.lastWALSequenceNumber,
        metadata: snapshot.metadata,
        data: snapshotData,
      },
      wal: {
        entriesCount: walEntries.length,
        firstSequence: walEntries[0]?.sequenceNumber ?? 0,
        lastSequence: walEntries[walEntries.length - 1]?.sequenceNumber ?? 0,
        entries: walEntries.map((entry) => ({
          sequenceNumber: entry.sequenceNumber,
          timestamp: entry.timestamp,
          collection: entry.collection,
          operationType: entry.operationType,
          documentId: entry.documentId,
          fullDocument: entry.fullDocument,
          updateDescription: entry.updateDescription,
          checksum: entry.checksum,
        })),
      },
      checksum: "", // Will be calculated below
    };

    // Calculate overall checksum
    const content = JSON.stringify(backupPackage);
    backupPackage.checksum = createHash("sha256").update(content).digest("hex");

    const data = Buffer.from(JSON.stringify(backupPackage));

    return {
      data,
      sizeBytes: data.length,
    };
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
   * Get MongoDB version
   */
  private async getMongoVersion(): Promise<string> {
    try {
      const db = mongoose.connection.db;
      if (!db) return "unknown";

      const info = await db.command({ buildInfo: 1 });
      return info.version || "unknown";
    } catch {
      return "unknown";
    }
  }

  /**
   * Run cleanup to remove old snapshots and WAL entries
   */
  async runCleanup(): Promise<void> {
    console.log("[BackupService] Running cleanup...");

    const now = new Date();

    // Calculate cutoff dates
    const walCutoff = new Date(now);
    walCutoff.setDate(walCutoff.getDate() - this.config.walRetentionDays);

    const snapshotCutoff = new Date(now);
    snapshotCutoff.setDate(
      snapshotCutoff.getDate() - this.config.snapshotRetentionDays,
    );

    // Delete old WAL entries that have been backed up
    const walDeleteResult = await WALEntry.deleteMany({
      backedUp: true,
      timestamp: { $lt: walCutoff },
    });

    console.log(
      `[BackupService] Deleted ${walDeleteResult.deletedCount} old WAL entries`,
    );

    // Delete old snapshots
    const oldSnapshots = await Snapshot.find({
      backedUpToExternal: true,
      createdAt: { $lt: snapshotCutoff },
    });

    for (const snapshot of oldSnapshots) {
      // Delete snapshot data
      const db = mongoose.connection.db;
      if (db) {
        await db
          .collection("_snapshot_data")
          .deleteMany({ snapshotId: snapshot.snapshotId });
      }

      // Delete snapshot record
      await Snapshot.deleteOne({ snapshotId: snapshot.snapshotId });
    }

    console.log(`[BackupService] Deleted ${oldSnapshots.length} old snapshots`);
  }

  /**
   * Get backup service statistics
   */
  async getStats(): Promise<BackupServiceStats> {
    const lastSnapshot = await Snapshot.findOne({ status: "completed" }).sort({
      createdAt: -1,
    });

    const lastExternalBackup = await Snapshot.findOne({
      backedUpToExternal: true,
    }).sort({ externalBackupAt: -1 });

    const totalSnapshots = await Snapshot.countDocuments();
    const totalWALEntries = await WALEntry.countDocuments();
    const pendingWALEntries = await WALEntry.countDocuments({
      backedUp: false,
    });

    // Calculate next backup time
    let nextScheduledBackup: Date | null = null;
    if (this.isRunning) {
      const now = new Date();
      nextScheduledBackup = new Date(now);
      nextScheduledBackup.setHours(this.config.dailyBackupHour, 0, 0, 0);
      if (nextScheduledBackup <= now) {
        nextScheduledBackup.setDate(nextScheduledBackup.getDate() + 1);
      }
    }

    return {
      lastSnapshotId: lastSnapshot?.snapshotId ?? null,
      lastSnapshotTime: lastSnapshot?.createdAt ?? null,
      lastExternalBackupTime: lastExternalBackup?.externalBackupAt ?? null,
      totalSnapshots,
      totalWALEntries,
      pendingWALEntries,
      nextScheduledBackup,
    };
  }

  /**
   * Get the latest completed snapshot
   */
  async getLatestSnapshot(): Promise<ISnapshot | null> {
    return Snapshot.findOne({
      status: { $in: ["completed", "backed_up"] },
    }).sort({
      createdAt: -1,
    });
  }

  /**
   * List all snapshots
   */
  async listSnapshots(limit = 10): Promise<ISnapshot[]> {
    return Snapshot.find().sort({ createdAt: -1 }).limit(limit);
  }

  /**
   * Trigger manual snapshot creation
   */
  async createManualSnapshot(): Promise<ISnapshot> {
    return this.createSnapshot();
  }

  /**
   * Trigger manual backup (respects daily limit via external provider)
   */
  async triggerManualBackup(): Promise<string | null> {
    return this.runDailyBackup();
  }
}

/**
 * Create a backup service instance
 */
export function createBackupService(
  config: BackupServiceConfig,
): BackupService {
  return new BackupService(config);
}
