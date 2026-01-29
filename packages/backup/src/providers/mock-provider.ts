import type { ExternalBackupProvider } from "../backup-service";

/**
 * Mock External Backup Provider Configuration
 */
export interface MockExternalBackupProviderConfig {
  /** Simulate network latency in ms */
  latencyMs?: number;
  /** Failure rate (0-1) */
  failureRate?: number;
  /** Storage limit in bytes */
  storageLimitBytes?: number;
}

/**
 * Mock External Backup Provider
 *
 * Simulates an external backup service with the "one call per day" constraint.
 * Useful for testing and development.
 */
export class MockExternalBackupProvider implements ExternalBackupProvider {
  private config: Required<MockExternalBackupProviderConfig>;
  private storage: Map<string, { data: Buffer; metadata: any }> = new Map();
  private lastUploadTime: Date | null = null;
  private totalStorageUsed = 0;
  private uploadCount = 0;

  constructor(config: MockExternalBackupProviderConfig = {}) {
    this.config = {
      latencyMs: config.latencyMs ?? 500,
      failureRate: config.failureRate ?? 0,
      storageLimitBytes: config.storageLimitBytes ?? 100 * 1024 * 1024, // 100MB
    };
  }

  /**
   * Upload backup data
   *
   * Strictly enforces ONE call per day
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
    // Simulate network latency
    await this.simulateLatency();

    // Check rate limit (one call per day)
    if (this.lastUploadTime) {
      const hoursSinceLastUpload =
        (Date.now() - this.lastUploadTime.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastUpload < 24) {
        const error = new Error(
          `[Valerix Backup Service] Rate limit exceeded!\n` +
            `You have already used your daily backup quota.\n` +
            `Last backup: ${this.lastUploadTime.toISOString()}\n` +
            `Time until next backup: ${(24 - hoursSinceLastUpload).toFixed(1)} hours`,
        );
        console.error(`[MockExternalBackupProvider] ${error.message}`);
        throw error;
      }
    }

    // Simulate random failures
    if (Math.random() < this.config.failureRate) {
      throw new Error(
        "[Valerix Backup Service] Service temporarily unavailable",
      );
    }

    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    // Check storage limit
    if (
      this.totalStorageUsed + dataBuffer.length >
      this.config.storageLimitBytes
    ) {
      throw new Error("[Valerix Backup Service] Storage quota exceeded");
    }

    // Generate backup reference
    const backupRef = `valerix-${metadata.database}-${Date.now()}-${++this.uploadCount}`;

    // Store backup
    this.storage.set(backupRef, {
      data: dataBuffer,
      metadata: {
        ...metadata,
        backupRef,
        uploadedAt: new Date().toISOString(),
      },
    });

    this.totalStorageUsed += dataBuffer.length;
    this.lastUploadTime = new Date();

    console.log(
      `[MockExternalBackupProvider] Backup uploaded successfully: ${backupRef}`,
    );
    console.log(
      `[MockExternalBackupProvider] Daily backup quota used. Next backup available in 24 hours.`,
    );

    return backupRef;
  }

  /**
   * Check if service is available
   */
  async healthCheck(): Promise<boolean> {
    await this.simulateLatency();
    return Math.random() > this.config.failureRate;
  }

  /**
   * Download backup data
   */
  async download(backupRef: string): Promise<Buffer> {
    await this.simulateLatency();

    const backup = this.storage.get(backupRef);
    if (!backup) {
      throw new Error(
        `[Valerix Backup Service] Backup not found: ${backupRef}`,
      );
    }

    return backup.data;
  }

  /**
   * Simulate network latency
   */
  private async simulateLatency(): Promise<void> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.latencyMs),
      );
    }
  }

  /**
   * Get provider statistics
   */
  getStats(): {
    uploadCount: number;
    storageUsed: number;
    storageLimit: number;
    lastUploadTime: Date | null;
    hoursUntilNextUpload: number;
  } {
    let hoursUntilNextUpload = 0;
    if (this.lastUploadTime) {
      const hoursSinceLastUpload =
        (Date.now() - this.lastUploadTime.getTime()) / (1000 * 60 * 60);
      hoursUntilNextUpload = Math.max(0, 24 - hoursSinceLastUpload);
    }

    return {
      uploadCount: this.uploadCount,
      storageUsed: this.totalStorageUsed,
      storageLimit: this.config.storageLimitBytes,
      lastUploadTime: this.lastUploadTime,
      hoursUntilNextUpload,
    };
  }

  /**
   * List stored backups
   */
  listBackups(): Array<{ backupRef: string; metadata: any }> {
    return Array.from(this.storage.entries()).map(
      ([backupRef, { metadata }]) => ({
        backupRef,
        metadata,
      }),
    );
  }

  /**
   * Reset provider state (for testing)
   */
  reset(): void {
    this.storage.clear();
    this.lastUploadTime = null;
    this.totalStorageUsed = 0;
    this.uploadCount = 0;
  }

  /**
   * Force reset rate limit (for testing)
   */
  resetRateLimit(): void {
    this.lastUploadTime = null;
  }
}
