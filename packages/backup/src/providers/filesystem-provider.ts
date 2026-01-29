import { createWriteStream, createReadStream, existsSync, mkdirSync } from "fs";
import { readFile, writeFile, mkdir, readdir, stat } from "fs/promises";
import { join } from "path";
import { createGzip, createGunzip } from "zlib";
import { pipeline } from "stream/promises";
import type { ExternalBackupProvider } from "../backup-service";

/**
 * Filesystem Backup Provider Configuration
 */
export interface FileSystemBackupProviderConfig {
  /** Base directory for storing backups */
  backupDir: string;
  /** Whether to compress backups */
  compress?: boolean;
  /** Maximum number of backups to retain */
  maxBackups?: number;
}

/**
 * Filesystem Backup Provider
 *
 * Stores backups on the local filesystem.
 * Useful for development, testing, or when external cloud storage isn't available.
 *
 * Note: This simulates the "one call per day" constraint by rate-limiting uploads.
 */
export class FileSystemBackupProvider implements ExternalBackupProvider {
  private config: Required<FileSystemBackupProviderConfig>;
  private lastUploadTime: Date | null = null;

  constructor(config: FileSystemBackupProviderConfig) {
    this.config = {
      backupDir: config.backupDir,
      compress: config.compress ?? true,
      maxBackups: config.maxBackups ?? 30,
    };

    // Ensure backup directory exists
    if (!existsSync(this.config.backupDir)) {
      mkdirSync(this.config.backupDir, { recursive: true });
    }
  }

  /**
   * Upload backup data to filesystem
   *
   * Enforces the "one call per day" constraint
   */
  async upload(
    data: Buffer | string,
    metadata: {
      snapshotId: string;
      database: string;
      timestamp: Date;
      sizeBytes: number;
      walEntriesCount: number;
    },
  ): Promise<string> {
    // Check rate limit (one call per day)
    if (this.lastUploadTime) {
      const hoursSinceLastUpload =
        (Date.now() - this.lastUploadTime.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastUpload < 24) {
        throw new Error(
          `Rate limit exceeded: Only one backup upload per day allowed. ` +
            `Last upload was ${hoursSinceLastUpload.toFixed(1)} hours ago. ` +
            `Try again in ${(24 - hoursSinceLastUpload).toFixed(1)} hours.`,
        );
      }
    }

    const timestamp = metadata.timestamp.toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${metadata.database}-${timestamp}${
      this.config.compress ? ".json.gz" : ".json"
    }`;
    const filepath = join(this.config.backupDir, filename);

    console.log(`[FileSystemBackupProvider] Writing backup to: ${filepath}`);

    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    if (this.config.compress) {
      // Write compressed
      await pipeline(
        createReadStream(dataBuffer as any), // This won't work, let's fix it
        createGzip(),
        createWriteStream(filepath),
      ).catch(async () => {
        // Fallback: compress in memory
        const { gzipSync } = await import("zlib");
        const compressed = gzipSync(dataBuffer);
        await writeFile(filepath, compressed);
      });

      // Actually, let's just use the sync compression
      const { gzipSync } = await import("zlib");
      const compressed = gzipSync(dataBuffer);
      await writeFile(filepath, compressed);
    } else {
      await writeFile(filepath, dataBuffer);
    }

    // Write metadata file
    const metadataPath = filepath.replace(/\.(json\.gz|json)$/, ".meta.json");
    await writeFile(
      metadataPath,
      JSON.stringify(
        {
          ...metadata,
          filename,
          filepath,
          uploadedAt: new Date().toISOString(),
          compressed: this.config.compress,
        },
        null,
        2,
      ),
    );

    // Update last upload time
    this.lastUploadTime = new Date();

    // Cleanup old backups
    await this.cleanupOldBackups();

    console.log(`[FileSystemBackupProvider] Backup saved: ${filename}`);

    return filename;
  }

  /**
   * Check if provider is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testFile = join(this.config.backupDir, ".health-check");
      await writeFile(testFile, "ok");
      const { unlink } = await import("fs/promises");
      await unlink(testFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Download backup data
   */
  async download(backupRef: string): Promise<Buffer> {
    const filepath = join(this.config.backupDir, backupRef);

    if (!existsSync(filepath)) {
      throw new Error(`Backup not found: ${backupRef}`);
    }

    const data = await readFile(filepath);

    if (backupRef.endsWith(".gz")) {
      const { gunzipSync } = await import("zlib");
      return gunzipSync(data);
    }

    return data;
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<
    Array<{
      filename: string;
      timestamp: Date;
      sizeBytes: number;
    }>
  > {
    const files = await readdir(this.config.backupDir);
    const backups: Array<{
      filename: string;
      timestamp: Date;
      sizeBytes: number;
    }> = [];

    for (const file of files) {
      if (file.endsWith(".json") || file.endsWith(".json.gz")) {
        const filepath = join(this.config.backupDir, file);
        const stats = await stat(filepath);
        backups.push({
          filename: file,
          timestamp: stats.mtime,
          sizeBytes: stats.size,
        });
      }
    }

    return backups.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }

  /**
   * Cleanup old backups beyond retention limit
   */
  private async cleanupOldBackups(): Promise<void> {
    const backups = await this.listBackups();

    if (backups.length <= this.config.maxBackups) {
      return;
    }

    const { unlink } = await import("fs/promises");
    const toDelete = backups.slice(this.config.maxBackups);

    for (const backup of toDelete) {
      const filepath = join(this.config.backupDir, backup.filename);
      const metaPath = filepath.replace(/\.(json\.gz|json)$/, ".meta.json");

      try {
        await unlink(filepath);
        await unlink(metaPath).catch(() => {});
        console.log(
          `[FileSystemBackupProvider] Deleted old backup: ${backup.filename}`,
        );
      } catch (error) {
        console.error(
          `[FileSystemBackupProvider] Failed to delete: ${backup.filename}`,
        );
      }
    }
  }

  /**
   * Get time until next upload is allowed
   */
  getTimeUntilNextUpload(): number {
    if (!this.lastUploadTime) {
      return 0;
    }

    const msSinceLastUpload = Date.now() - this.lastUploadTime.getTime();
    const msInDay = 24 * 60 * 60 * 1000;

    return Math.max(0, msInDay - msSinceLastUpload);
  }

  /**
   * Reset rate limit (for testing purposes)
   */
  resetRateLimit(): void {
    this.lastUploadTime = null;
  }
}
