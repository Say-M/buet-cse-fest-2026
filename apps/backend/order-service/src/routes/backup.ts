/** @format */

import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { AppBindings } from "../app";
import {
  getWALWriterStats,
  getBackupServiceStats,
  isBackupWorkerRunning,
  createManualSnapshot,
  triggerManualBackup,
  getExternalProviderStats,
  listSnapshots,
} from "../workers/backup.worker";

const backupRoutes = new Hono<AppBindings>();

/**
 * Get backup system status
 */
backupRoutes.get(
  "/status",
  describeRoute({
    tags: ["Backup"],
    summary: "Get backup system status",
    description:
      "Returns the current status of the WAL writer, backup service, and external provider",
    responses: {
      200: { description: "Backup system status" },
    },
  }),
  async (c) => {
    const walStats = getWALWriterStats();
    const backupStats = await getBackupServiceStats();
    const providerStats = getExternalProviderStats();
    const isRunning = isBackupWorkerRunning();

    return c.json({
      status: isRunning ? "running" : "stopped",
      timestamp: new Date().toISOString(),
      walWriter: walStats,
      backupService: backupStats,
      externalProvider: providerStats
        ? {
            ...providerStats,
            message:
              providerStats.hoursUntilNextUpload > 0
                ? `Daily backup quota used. Next backup available in ${providerStats.hoursUntilNextUpload.toFixed(
                    1,
                  )} hours.`
                : "Daily backup quota available.",
          }
        : null,
    });
  },
);

/**
 * List snapshots
 */
backupRoutes.get(
  "/snapshots",
  describeRoute({
    tags: ["Backup"],
    summary: "List available snapshots",
    responses: {
      200: { description: "List of snapshots" },
    },
  }),
  async (c) => {
    const limit = parseInt(c.req.query("limit") || "10", 10);
    const snapshots = await listSnapshots(limit);

    return c.json({
      count: snapshots.length,
      snapshots: snapshots.map((s) => ({
        snapshotId: s.snapshotId,
        name: s.name,
        status: s.status,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
        collectionsCount: s.collections.length,
        totalSizeBytes: s.totalSizeBytes,
        backedUpToExternal: s.backedUpToExternal,
        externalBackupAt: s.externalBackupAt,
      })),
    });
  },
);

/**
 * Create a manual snapshot
 *
 * This creates a local snapshot WITHOUT using the daily external backup quota.
 */
backupRoutes.post(
  "/snapshot",
  describeRoute({
    tags: ["Backup"],
    summary: "Create manual snapshot",
    description:
      "Creates a local snapshot. Does NOT consume the daily external backup quota.",
    responses: {
      200: { description: "Snapshot created" },
      503: { description: "Backup service not available" },
    },
  }),
  async (c) => {
    const snapshotId = await createManualSnapshot();

    if (!snapshotId) {
      return c.json(
        {
          success: false,
          message: "Backup service not running",
        },
        503,
      );
    }

    return c.json({
      success: true,
      message: "Snapshot created successfully",
      snapshotId,
      note: "This is a local snapshot. It does NOT consume your daily external backup quota.",
    });
  },
);

/**
 * Trigger manual external backup
 *
 * WARNING: This uses the ONE daily call to the external backup service!
 */
backupRoutes.post(
  "/trigger",
  describeRoute({
    tags: ["Backup"],
    summary: "Trigger external backup",
    description:
      "⚠️ WARNING: Triggers the daily backup to external service. This uses your ONE daily backup call!",
    responses: {
      200: { description: "Backup triggered" },
      429: { description: "Daily backup quota exhausted" },
      503: { description: "Backup service not available" },
    },
  }),
  async (c) => {
    const providerStats = getExternalProviderStats();

    // Check if daily quota is available
    if (providerStats && providerStats.hoursUntilNextUpload > 0) {
      return c.json(
        {
          success: false,
          message: `Daily backup quota exhausted. Next backup available in ${providerStats.hoursUntilNextUpload.toFixed(
            1,
          )} hours.`,
          lastUploadTime: providerStats.lastUploadTime,
          hoursUntilNextUpload: providerStats.hoursUntilNextUpload,
        },
        429,
      );
    }

    try {
      const backupRef = await triggerManualBackup();

      if (!backupRef) {
        return c.json(
          {
            success: false,
            message: "Backup service not running",
          },
          503,
        );
      }

      return c.json({
        success: true,
        message: "External backup completed successfully",
        backupRef,
        warning:
          "Daily backup quota has been used. Next backup will be available in 24 hours.",
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : "Backup failed",
        },
        500,
      );
    }
  },
);

/**
 * Get backup strategy explanation
 */
backupRoutes.get(
  "/strategy",
  describeRoute({
    tags: ["Backup"],
    summary: "Get backup strategy explanation",
    description:
      "Returns documentation about the incremental WAL backup strategy",
    responses: {
      200: { description: "Strategy documentation" },
    },
  }),
  async (c) => {
    return c.json({
      title: "Incremental Backup with Write-Ahead Logs (WAL)",
      constraint: "External backup service allows only ONE call per day",
      solution: {
        description:
          "We use a WAL-based incremental backup strategy to preserve data continuously while respecting the daily backup limit.",
        components: [
          {
            name: "WAL Writer",
            description:
              "Continuously captures all database changes using MongoDB Change Streams",
            benefit: "No data loss between daily backups",
          },
          {
            name: "Local Snapshots",
            description:
              "Creates periodic point-in-time snapshots stored locally",
            benefit: "Fast local recovery without using external quota",
          },
          {
            name: "Daily External Backup",
            description:
              "Once per day, packages snapshot + WAL entries and uploads to external service",
            benefit: "Off-site disaster recovery",
          },
          {
            name: "Point-in-Time Recovery",
            description:
              "Restore to any point in time by applying WAL entries to a snapshot",
            benefit: "Fine-grained recovery options",
          },
        ],
      },
      howItWorks: [
        "1. WAL Writer listens to MongoDB Change Streams",
        "2. Every database change is logged as an immutable WAL entry",
        "3. Periodic snapshots capture full database state",
        "4. Daily backup combines latest snapshot + all WAL entries since",
        "5. Recovery: restore snapshot, then replay WAL entries to target time",
      ],
      dataPreservation:
        "Data is preserved multiple times locally (every change captured), while only making ONE external backup call per day.",
    });
  },
);

export default backupRoutes;
