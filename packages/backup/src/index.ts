/**
 * @repo/backup - Incremental Backup with Write-Ahead Logs
 *
 * This package implements an incremental backup strategy using WAL (Write-Ahead Logs)
 * to solve the "one backup call per day" constraint while preserving data multiple times.
 *
 * Strategy:
 * 1. WAL Writer continuously captures all database changes via MongoDB Change Streams
 * 2. Backup Service creates periodic local snapshots
 * 3. Once per day, packages snapshot + WAL entries and sends to external backup service
 * 4. Point-in-time recovery is possible by restoring snapshot + replaying WAL entries
 *
 * @example
 * ```typescript
 * import {
 *   createWALWriter,
 *   createBackupService,
 *   createRestoreService
 * } from "@repo/backup";
 *
 * // Start WAL writer to capture all changes
 * const walWriter = createWALWriter({ database: "my_db" });
 * await walWriter.start();
 *
 * // Create backup service for daily backups
 * const backupService = createBackupService({
 *   serviceName: "order-service",
 *   database: "order_db",
 *   dailyBackupHour: 2, // 2 AM
 * });
 * await backupService.start();
 *
 * // Restore to a specific point in time
 * const restoreService = createRestoreService();
 * await restoreService.pointInTimeRestore({
 *   targetTimestamp: new Date("2024-01-15T10:30:00Z"),
 * });
 * ```
 */

// Models
export {
  WALEntry,
  type IWALEntry,
  type WALOperationType,
} from "./models/wal-entry";
export {
  Snapshot,
  type ISnapshot,
  type ICollectionSnapshot,
  type SnapshotStatus,
} from "./models/snapshot";
export {
  SequenceCounter,
  type ISequenceCounter,
  getNextSequenceNumber,
  getCurrentSequenceNumber,
} from "./models/sequence-counter";

// WAL Writer
export {
  WALWriter,
  createWALWriter,
  type WALWriterConfig,
  type WALWriterStats,
} from "./wal-writer";

// Backup Service
export {
  BackupService,
  createBackupService,
  type BackupServiceConfig,
  type BackupServiceStats,
  type ExternalBackupProvider,
} from "./backup-service";

// Restore Service
export {
  RestoreService,
  createRestoreService,
  type RestoreServiceConfig,
  type RestoreResult,
  type PointInTimeRestoreOptions,
} from "./restore-service";

// External Backup Providers
export {
  FileSystemBackupProvider,
  type FileSystemBackupProviderConfig,
} from "./providers/filesystem-provider";
export {
  MockExternalBackupProvider,
  type MockExternalBackupProviderConfig,
} from "./providers/mock-provider";
