#!/usr/bin/env bun
/**
 * Test Script for WAL Backup System
 *
 * This script tests the backup functionality locally:
 * 1. Creates some test data (orders)
 * 2. Verifies WAL entries are captured
 * 3. Creates a snapshot
 * 4. Shows backup status
 *
 * Usage:
 *   bun run scripts/test-backup.ts
 *
 */

const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://localhost:3001";

interface TestResult {
  step: string;
  success: boolean;
  message: string;
  data?: any;
}

const results: TestResult[] = [];

async function log(
  step: string,
  success: boolean,
  message: string,
  data?: any,
) {
  results.push({ step, success, message, data });
  const icon = success ? "✅" : "❌";
  console.log(`${icon} ${step}: ${message}`);
  if (data) {
    console.log(
      "   Data:",
      JSON.stringify(data, null, 2).split("\n").join("\n   "),
    );
  }
}

async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${ORDER_SERVICE_URL}/health/live`);
    const data = await response.json();
    await log(
      "Health Check",
      response.ok,
      `Order service is ${data.status}`,
      data,
    );
    return response.ok;
  } catch (error) {
    await log("Health Check", false, `Failed to connect: ${error}`);
    return false;
  }
}

async function checkBackupStatus(): Promise<any> {
  try {
    const response = await fetch(`${ORDER_SERVICE_URL}/backup/status`);

    if (response.status === 404) {
      await log(
        "Backup Status",
        false,
        "Backup endpoints not available. Make sure BACKUP_ENABLED=true",
      );
      return null;
    }

    const data = await response.json();
    await log("Backup Status", response.ok, `Backup system is ${data.status}`, {
      walWriter: data.walWriter
        ? {
            isRunning: data.walWriter.isRunning,
            totalEntriesWritten: data.walWriter.totalEntriesWritten,
            lastSequenceNumber: data.walWriter.lastSequenceNumber,
          }
        : "Not running",
      backupService: data.backupService
        ? {
            lastSnapshotId: data.backupService.lastSnapshotId,
            totalSnapshots: data.backupService.totalSnapshots,
            totalWALEntries: data.backupService.totalWALEntries,
            pendingWALEntries: data.backupService.pendingWALEntries,
          }
        : "Not running",
    });
    return data;
  } catch (error) {
    await log("Backup Status", false, `Failed to get status: ${error}`);
    return null;
  }
}

async function createTestOrder(): Promise<string | null> {
  try {
    const payload = {
      customerId: `TEST-${Date.now()}`,
      items: [
        {
          productId: "PROD-001",
          quantity: 2,
          price: 99.99,
        },
      ],
      idempotencyKey: `test-${Date.now()}`,
    };

    const response = await fetch(`${ORDER_SERVICE_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": payload.idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok && data.orderId) {
      await log("Create Order", true, `Order created: ${data.orderId}`, {
        orderId: data.orderId,
        status: data.status,
      });
      return data.orderId;
    } else {
      await log(
        "Create Order",
        false,
        `Failed to create order: ${data.message}`,
        data,
      );
      return null;
    }
  } catch (error) {
    await log("Create Order", false, `Failed to create order: ${error}`);
    return null;
  }
}

async function createSnapshot(): Promise<string | null> {
  try {
    const response = await fetch(`${ORDER_SERVICE_URL}/backup/snapshot`, {
      method: "POST",
    });

    if (response.status === 404) {
      await log("Create Snapshot", false, "Backup endpoints not available");
      return null;
    }

    const data = await response.json();

    if (data.success) {
      await log(
        "Create Snapshot",
        true,
        `Snapshot created: ${data.snapshotId}`,
        data,
      );
      return data.snapshotId;
    } else {
      await log("Create Snapshot", false, `Failed: ${data.message}`, data);
      return null;
    }
  } catch (error) {
    await log("Create Snapshot", false, `Failed: ${error}`);
    return null;
  }
}

async function listSnapshots(): Promise<void> {
  try {
    const response = await fetch(`${ORDER_SERVICE_URL}/backup/snapshots`);

    if (response.status === 404) {
      await log("List Snapshots", false, "Backup endpoints not available");
      return;
    }

    const data = await response.json();
    await log("List Snapshots", true, `Found ${data.count} snapshots`, {
      count: data.count,
      snapshots: data.snapshots?.slice(0, 3),
    });
  } catch (error) {
    await log("List Snapshots", false, `Failed: ${error}`);
  }
}

async function getBackupStrategy(): Promise<void> {
  try {
    const response = await fetch(`${ORDER_SERVICE_URL}/backup/strategy`);

    if (response.status === 404) {
      await log("Backup Strategy", false, "Backup endpoints not available");
      return;
    }

    const data = await response.json();
    await log("Backup Strategy", true, data.title, {
      constraint: data.constraint,
      components: data.solution?.components?.map((c: any) => c.name),
    });
  } catch (error) {
    await log("Backup Strategy", false, `Failed: ${error}`);
  }
}

async function waitForWALCapture(
  expectedCount: number,
  timeoutMs = 5000,
): Promise<void> {
  console.log(
    `\n⏳ Waiting for WAL to capture changes (up to ${timeoutMs / 1000}s)...`,
  );

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${ORDER_SERVICE_URL}/backup/status`);
      if (response.ok) {
        const data = await response.json();
        const walEntries = data.backupService?.totalWALEntries || 0;

        if (walEntries >= expectedCount) {
          console.log(`   WAL entries captured: ${walEntries}`);
          return;
        }
      }
    } catch {
      // Ignore errors, keep waiting
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("   Timeout waiting for WAL capture");
}

async function main() {
  console.log(
    "╔════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║           WAL Backup System - Local Test Script                ║",
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════╝\n",
  );

  console.log(`Target: ${ORDER_SERVICE_URL}\n`);

  // Step 1: Check health
  console.log("─── Step 1: Health Check ───");
  const isHealthy = await checkHealth();

  if (!isHealthy) {
    console.log("\n❌ Order service is not running. Please start it with:");
    console.log(
      "   cd apps/backend/order-service && BACKUP_ENABLED=true bun run dev\n",
    );
    process.exit(1);
  }

  // Step 2: Check backup status (initial)
  console.log("\n─── Step 2: Initial Backup Status ───");
  const initialStatus = await checkBackupStatus();

  if (!initialStatus || initialStatus.status !== "running") {
    console.log("\n⚠️  Backup worker not running. Restart order service with:");
    console.log("   BACKUP_ENABLED=true bun run dev");
    console.log("\nContinuing test anyway...\n");
  }

  const initialWALCount = initialStatus?.backupService?.totalWALEntries || 0;

  // Step 3: Get backup strategy info
  console.log("\n─── Step 3: Backup Strategy ───");
  await getBackupStrategy();

  // Step 4: Create test orders to generate WAL entries
  console.log("\n─── Step 4: Create Test Orders ───");
  const orders: string[] = [];

  for (let i = 0; i < 3; i++) {
    const orderId = await createTestOrder();
    if (orderId) orders.push(orderId);
    await new Promise((resolve) => setTimeout(resolve, 200)); // Small delay
  }

  if (orders.length > 0) {
    // Wait for WAL to capture the changes
    await waitForWALCapture(initialWALCount + orders.length);
  }

  // Step 5: Check backup status again (should show WAL entries)
  console.log("\n─── Step 5: Verify WAL Capture ───");
  const afterStatus = await checkBackupStatus();

  if (afterStatus?.backupService) {
    const newEntries =
      afterStatus.backupService.totalWALEntries - initialWALCount;
    if (newEntries > 0) {
      await log(
        "WAL Verification",
        true,
        `${newEntries} new WAL entries captured!`,
        {
          before: initialWALCount,
          after: afterStatus.backupService.totalWALEntries,
          new: newEntries,
        },
      );
    } else {
      await log(
        "WAL Verification",
        false,
        "No new WAL entries captured. Check if WAL writer is running.",
      );
    }
  }

  // Step 6: Create a snapshot
  console.log("\n─── Step 6: Create Snapshot ───");
  await createSnapshot();

  // Step 7: List snapshots
  console.log("\n─── Step 7: List Snapshots ───");
  await listSnapshots();

  // Summary
  console.log(
    "\n╔════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                        Test Summary                            ║",
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════╝\n",
  );

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`Total Steps: ${results.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);

  if (failed > 0) {
    console.log("\nFailed steps:");
    results
      .filter((r) => !r.success)
      .forEach((r) => console.log(`  - ${r.step}: ${r.message}`));
  }

  console.log("\n─── Quick Reference ───");
  console.log("Endpoints available at:");
  console.log(
    `  GET  ${ORDER_SERVICE_URL}/backup/status    - View backup status`,
  );
  console.log(`  GET  ${ORDER_SERVICE_URL}/backup/snapshots - List snapshots`);
  console.log(`  POST ${ORDER_SERVICE_URL}/backup/snapshot  - Create snapshot`);
  console.log(
    `  POST ${ORDER_SERVICE_URL}/backup/trigger   - Trigger daily backup (⚠️ 1/day)`,
  );
  console.log(
    `  GET  ${ORDER_SERVICE_URL}/backup/strategy  - View strategy docs`,
  );

  console.log("\n");
}

main().catch(console.error);
