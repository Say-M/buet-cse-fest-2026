<!-- @format -->

# @repo/backup - Incremental Backup with Write-Ahead Logs

This package implements an incremental backup strategy using Write-Ahead Logs (WAL) to solve the challenge of preserving data multiple times while only having **ONE backup call per day** to the external backup service.

## The Challenge

> "Valerix still relies on a very old-school backup service. It only allows one call per day for backup operation."
>
> Your mind races. Can you ensure that your data is safely preserved multiple times, given this restriction? Can it be done, without asking much of your resources?

## The Solution

We use a **WAL-based incremental backup strategy** that continuously captures all database changes locally, allowing full state reconstruction at any point in time, while respecting the daily backup limit.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Database Operations                          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                WAL Writer (Change Streams)                      │
│  - Captures EVERY database change                               │
│  - Writes to local WAL entries collection                       │
│  - Checksums for integrity                                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
┌─────────────────────┐     ┌──────────────────────────────────────┐
│   Local Snapshots   │     │      Daily External Backup           │
│  (Multiple/day OK)  │     │  (ONE call per day to Valerix)       │
│                     │     │                                      │
│  - Point-in-time    │     │  Snapshot + WAL entries →  📤        │
│  - Fast recovery    │     │                                      │
└─────────────────────┘     └──────────────────────────────────────┘
```

## How It Works

### 1. WAL Writer (Continuous)

The WAL Writer uses MongoDB Change Streams to capture every database change in real-time:

```typescript
import { createWALWriter } from "@repo/backup";

const walWriter = createWALWriter({
  database: "order_db",
  collections: ["orders", "inventory"], // or empty for all
  excludeCollections: ["logs"], // optional
});

await walWriter.start();
```

**Every** insert, update, delete, and replace operation is logged as an immutable WAL entry with:

- Sequence number (globally unique, monotonically increasing)
- Full document state (or update description)
- Checksum for integrity verification
- Timestamp for point-in-time recovery

### 2. Backup Service (Daily External + Unlimited Local)

```typescript
import { createBackupService, MockExternalBackupProvider } from "@repo/backup";

// This simulates Valerix's backup service with the ONE call/day limit
const externalProvider = new MockExternalBackupProvider();

const backupService = createBackupService({
  serviceName: "order-service",
  database: "order_db",
  externalProvider,
  dailyBackupHour: 2, // 2 AM
});

await backupService.start();
```

The backup service:

- Creates **unlimited local snapshots** (no external call)
- Packages snapshot + WAL entries for the **ONE daily external backup**
- Manages retention and cleanup
- Schedules automatic daily backups

### 3. Restore Service (Point-in-Time Recovery)

```typescript
import { createRestoreService } from "@repo/backup";

const restoreService = createRestoreService();

// Restore to exact point in time
await restoreService.pointInTimeRestore({
  targetTimestamp: new Date("2024-01-15T10:30:00Z"),
});

// Or restore from external backup
await restoreService.restoreFromExternal("backup-ref-123");
```

## Data Preservation Strategy

| Method          | Frequency  | Storage | Use Case                     |
| --------------- | ---------- | ------- | ---------------------------- |
| WAL Entries     | Continuous | Local   | Every single change captured |
| Local Snapshots | On-demand  | Local   | Fast local recovery          |
| External Backup | Once/day   | Valerix | Disaster recovery            |

### Recovery Scenarios

1. **Recent data loss** (last few minutes/hours):
   - Restore from latest local snapshot
   - Replay WAL entries to exact point in time

2. **Server crash**:
   - Restore from latest local snapshot + WAL
   - No data loss (WAL captures everything)

3. **Complete data center failure**:
   - Download from Valerix external backup
   - Maximum data loss: up to 24 hours (since last daily backup)

## API Endpoints

The backup system exposes these endpoints on the Order Service:

| Endpoint            | Method | Description                                    |
| ------------------- | ------ | ---------------------------------------------- |
| `/backup/status`    | GET    | Get backup system status                       |
| `/backup/snapshots` | GET    | List available snapshots                       |
| `/backup/snapshot`  | POST   | Create manual snapshot (local)                 |
| `/backup/trigger`   | POST   | Trigger external backup (⚠️ uses daily quota!) |
| `/backup/strategy`  | GET    | Get strategy documentation                     |

## Environment Variables

```bash
# Enable backup worker
BACKUP_ENABLED=true

# Hour of day to run daily backup (0-23)
BACKUP_HOUR=2

# Retention periods
WAL_RETENTION_DAYS=7
SNAPSHOT_RETENTION_DAYS=30

# Use filesystem provider instead of mock
BACKUP_USE_FILESYSTEM=true
BACKUP_DIR=/app/backups
```

## External Backup Providers

### MockExternalBackupProvider (Development/Testing)

Simulates Valerix's backup service with strict rate limiting:

```typescript
import { MockExternalBackupProvider } from "@repo/backup";

const provider = new MockExternalBackupProvider({
  latencyMs: 500, // Simulate network latency
  failureRate: 0.05, // 5% random failures
  storageLimitBytes: 500 * 1024 * 1024, // 500MB
});

// Rate limited: throws error if called more than once per 24 hours
await provider.upload(data, metadata);
```

### FileSystemBackupProvider (Production)

Stores backups on local filesystem with same rate limiting:

```typescript
import { FileSystemBackupProvider } from "@repo/backup";

const provider = new FileSystemBackupProvider({
  backupDir: "/app/backups",
  compress: true,
  maxBackups: 30,
});
```

### Custom Provider

Implement the `ExternalBackupProvider` interface for cloud storage:

```typescript
interface ExternalBackupProvider {
  upload(data: Buffer, metadata: BackupMetadata): Promise<string>;
  download(backupRef: string): Promise<Buffer>;
  healthCheck(): Promise<boolean>;
}
```

## Architecture

```
packages/backup/
├── src/
│   ├── index.ts              # Public exports
│   ├── models/
│   │   ├── wal-entry.ts      # WAL entry schema
│   │   ├── snapshot.ts       # Snapshot schema
│   │   └── sequence-counter.ts # Atomic sequence generator
│   ├── wal-writer.ts         # Change stream listener
│   ├── backup-service.ts     # Snapshot & daily backup
│   ├── restore-service.ts    # Recovery operations
│   └── providers/
│       ├── mock-provider.ts      # Valerix simulation
│       └── filesystem-provider.ts # Local storage
├── package.json
└── README.md
```

## The Key Insight

The challenge says we can only make **one backup call per day** to the external service. But it doesn't say we can't:

1. **Capture changes continuously** (WAL Writer)
2. **Store data locally** (Snapshots + WAL entries)
3. **Package everything into ONE daily call** (Backup Service)

This gives us:

- ✅ **Continuous data preservation** (every change captured)
- ✅ **Point-in-time recovery** (replay WAL to any timestamp)
- ✅ **Compliance with daily limit** (one external call)
- ✅ **Efficient resource usage** (incremental, not full backups)

## License

Private - Part of the hackathon project
