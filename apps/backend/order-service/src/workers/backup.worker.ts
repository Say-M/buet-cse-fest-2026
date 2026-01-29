import {
  createWALWriter,
  createBackupService,
  MockExternalBackupProvider,
  FileSystemBackupProvider,
  type WALWriter,
  type BackupService,
  type WALWriterStats,
  type BackupServiceStats,
} from "@repo/backup";

let walWriter: WALWriter | null = null;
let backupService: BackupService | null = null;
let externalProvider:
  | MockExternalBackupProvider
  | FileSystemBackupProvider
  | null = null;

/**
 * Backup Worker Configuration
 */
interface BackupWorkerConfig {
  /** Database name */
  database: string;
  /** Service name for metadata */
  serviceName?: string;
  /** Collections to backup (empty = all) */
  collections?: string[];
  /** Collections to exclude from backup */
  excludeCollections?: string[];
  /** Hour of day to run daily backup (0-23) */
  dailyBackupHour?: number;
  /** WAL retention period in days */
  walRetentionDays?: number;
  /** Snapshot retention period in days */
  snapshotRetentionDays?: number;
  /** Use filesystem provider instead of mock */
  useFilesystemProvider?: boolean;
  /** Directory for filesystem backups */
  backupDir?: string;
}

const DEFAULT_CONFIG: BackupWorkerConfig = {
  database: process.env.MONGO_DB_NAME || "order_db",
  serviceName: "order-service",
  collections: [], // Empty = all collections
  excludeCollections: [],
  dailyBackupHour: parseInt(process.env.BACKUP_HOUR || "2", 10),
  walRetentionDays: parseInt(process.env.WAL_RETENTION_DAYS || "7", 10),
  snapshotRetentionDays: parseInt(
    process.env.SNAPSHOT_RETENTION_DAYS || "30",
    10,
  ),
  useFilesystemProvider: process.env.BACKUP_USE_FILESYSTEM === "true",
  backupDir: process.env.BACKUP_DIR || "/tmp/backups",
};

/**
 * Start the backup worker
 */
export async function startBackupWorker(
  config: Partial<BackupWorkerConfig> = {},
): Promise<void> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  console.log("[BackupWorker] Starting backup worker...");
  console.log(`[BackupWorker] Database: ${mergedConfig.database}`);
  console.log(
    `[BackupWorker] Daily backup hour: ${mergedConfig.dailyBackupHour}:00`,
  );

  // Create external backup provider
  // This simulates the "Valerix old-school backup service" that only allows one call per day
  if (mergedConfig.useFilesystemProvider) {
    externalProvider = new FileSystemBackupProvider({
      backupDir: mergedConfig.backupDir!,
      compress: true,
      maxBackups: 30,
    });
    console.log(
      `[BackupWorker] Using filesystem provider: ${mergedConfig.backupDir}`,
    );
  } else {
    externalProvider = new MockExternalBackupProvider({
      latencyMs: 500,
      failureRate: 0.05, // 5% failure rate to simulate real-world conditions
      storageLimitBytes: 500 * 1024 * 1024, // 500MB
    });
    console.log(
      "[BackupWorker] Using mock external provider (Valerix simulation)",
    );
  }

  // Create and start WAL Writer
  walWriter = createWALWriter({
    database: mergedConfig.database,
    collections: mergedConfig.collections,
    excludeCollections: mergedConfig.excludeCollections,
    batchSize: 100,
    flushIntervalMs: 1000,
  });

  await walWriter.start();
  console.log("[BackupWorker] WAL Writer started");

  // Create and start Backup Service
  backupService = createBackupService({
    serviceName: mergedConfig.serviceName!,
    database: mergedConfig.database,
    collections: mergedConfig.collections,
    excludeCollections: mergedConfig.excludeCollections,
    externalProvider,
    dailyBackupHour: mergedConfig.dailyBackupHour,
    walRetentionDays: mergedConfig.walRetentionDays,
    snapshotRetentionDays: mergedConfig.snapshotRetentionDays,
  });

  await backupService.start();
  console.log("[BackupWorker] Backup Service started");

  console.log("[BackupWorker] Backup worker started successfully");
  console.log(
    `[BackupWorker] ⚠️  IMPORTANT: External backup service allows only ONE call per day!`,
  );
  console.log(
    `[BackupWorker] WAL entries are captured continuously for point-in-time recovery.`,
  );
}

/**
 * Stop the backup worker
 */
export async function stopBackupWorker(): Promise<void> {
  console.log("[BackupWorker] Stopping backup worker...");

  if (backupService) {
    await backupService.stop();
    backupService = null;
  }

  if (walWriter) {
    await walWriter.stop();
    walWriter = null;
  }

  console.log("[BackupWorker] Backup worker stopped");
}

/**
 * Get WAL Writer statistics
 */
export function getWALWriterStats(): WALWriterStats | null {
  return walWriter?.getStats() ?? null;
}

/**
 * Get Backup Service statistics
 */
export async function getBackupServiceStats(): Promise<BackupServiceStats | null> {
  return backupService?.getStats() ?? null;
}

/**
 * Check if backup worker is running
 */
export function isBackupWorkerRunning(): boolean {
  return walWriter?.isActive() ?? false;
}

/**
 * Trigger a manual snapshot (does NOT use the daily external backup quota)
 */
export async function createManualSnapshot(): Promise<string | null> {
  if (!backupService) {
    console.warn("[BackupWorker] Backup service not running");
    return null;
  }

  const snapshot = await backupService.createManualSnapshot();
  return snapshot.snapshotId;
}

/**
 * Trigger a manual backup to external service
 *
 * WARNING: This uses your ONE daily backup call!
 */
export async function triggerManualBackup(): Promise<string | null> {
  if (!backupService) {
    console.warn("[BackupWorker] Backup service not running");
    return null;
  }

  console.log(
    "[BackupWorker] ⚠️  Triggering manual backup - this uses your daily quota!",
  );
  return backupService.triggerManualBackup();
}

/**
 * Get external provider statistics
 */
export function getExternalProviderStats(): {
  uploadCount: number;
  storageUsed: number;
  storageLimit: number;
  lastUploadTime: Date | null;
  hoursUntilNextUpload: number;
} | null {
  if (externalProvider instanceof MockExternalBackupProvider) {
    return externalProvider.getStats();
  }
  return null;
}

/**
 * List available snapshots
 */
export async function listSnapshots(limit = 10) {
  return backupService?.listSnapshots(limit) ?? [];
}
