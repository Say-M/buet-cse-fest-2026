# @repo/backup

Incremental backup using Write-Ahead Logs (WAL). Captures all DB changes locally, bundles into one daily external backup call.

## Usage

```typescript
import { createWALWriter, createBackupService } from "@repo/backup";

// Start capturing changes
const walWriter = createWALWriter({ database: "order_db" });
await walWriter.start();

// Daily backup
const backupService = createBackupService({
  serviceName: "order-service",
  database: "order_db",
  dailyBackupHour: 2,
});
await backupService.start();
```

## Endpoints

| Endpoint            | Method | Description          |
| ------------------- | ------ | -------------------- |
| `/backup/status`    | GET    | Backup status        |
| `/backup/snapshots` | GET    | List snapshots       |
| `/backup/snapshot`  | POST   | Create snapshot      |
| `/backup/trigger`   | POST   | Trigger daily backup |

## Config

```bash
BACKUP_ENABLED=true
BACKUP_HOUR=2
WAL_RETENTION_DAYS=7
SNAPSHOT_RETENTION_DAYS=30
```
