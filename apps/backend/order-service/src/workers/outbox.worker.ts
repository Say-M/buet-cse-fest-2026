import {
  createRabbitMQClient,
  EXCHANGES,
  ROUTING_KEYS,
  type RabbitMQClient,
} from "@repo/rabbitmq";
import { OutboxEvent, type IOutboxEvent } from "../models/outbox";
import { DeadLetterEvent } from "../models/dead-letter-event";
import { BackoffTracker, sleep } from "../lib/backoff";

// Import poison events counter (lazy import to avoid circular dependency)
let poisonEventsCounter: any = null;
function getPoisonEventsCounter() {
  if (!poisonEventsCounter) {
    try {
      const app = require("../app");
      poisonEventsCounter = app.poisonEventsCounter;
    } catch (error) {
      console.warn(
        "[OutboxWorker] Could not import poison events counter:",
        error,
      );
    }
  }
  return poisonEventsCounter;
}

interface OutboxWorkerConfig {
  pollIntervalMs: number;
  batchSize: number;
  maxRetries: number;
  leaseDurationMs: number;
}

const DEFAULT_CONFIG: OutboxWorkerConfig = {
  pollIntervalMs: 1000, // Poll every 1 second
  batchSize: 100, // Process up to 100 events at a time
  maxRetries: 10, // Max retries for failed events
  leaseDurationMs: 30000, // 30 second lease
};

let rabbitClient: RabbitMQClient | null = null;
let isRunning = false;
let workerPromise: Promise<void> | null = null;
let workerId: string = "";
const backoffTracker = new BackoffTracker({
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  jitter: 0.1,
});

// Stats for monitoring
let stats = {
  totalPublished: 0,
  totalFailed: 0,
  totalPoisonEvents: 0,
  lastPollTime: null as number | null,
  lastPublishTime: null as number | null,
  pendingEvents: 0,
};

/**
 * Generate unique worker ID
 */
function generateWorkerId(): string {
  const hostname = process.env.HOSTNAME || "unknown";
  const pid = process.pid;
  return `${hostname}-${pid}-${Date.now()}`;
}

/**
 * Start the outbox worker
 */
export async function startOutboxWorker(
  config: Partial<OutboxWorkerConfig> = {},
): Promise<void> {
  if (isRunning) {
    console.log("[OutboxWorker] Already running");
    return;
  }

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://localhost:5672";

  // Generate unique worker ID
  workerId = generateWorkerId();
  console.log(`[OutboxWorker] Worker ID: ${workerId}`);

  rabbitClient = createRabbitMQClient({
    url: rabbitmqUrl,
    exchange: EXCHANGES.ORDERS,
    exchangeType: "topic",
  });

  isRunning = true;

  // Connect to RabbitMQ with backoff
  await connectWithBackoff();

  // Start the polling loop
  workerPromise = pollLoop(mergedConfig);

  console.log("[OutboxWorker] Started");
}

/**
 * Connect to RabbitMQ with exponential backoff
 */
async function connectWithBackoff(): Promise<void> {
  backoffTracker.reset();

  while (isRunning) {
    try {
      await rabbitClient!.connect();
      console.log("[OutboxWorker] Connected to RabbitMQ");
      backoffTracker.reset();
      return;
    } catch (error) {
      const delay = backoffTracker.nextDelay();
      console.warn(
        `[OutboxWorker] Failed to connect to RabbitMQ (attempt ${backoffTracker.getStats().totalAttempts}), retrying in ${delay}ms:`,
        error instanceof Error ? error.message : error,
      );
      await sleep(delay);
    }
  }
}

/**
 * Main polling loop with atomic lease acquisition
 */
async function pollLoop(config: OutboxWorkerConfig): Promise<void> {
  while (isRunning) {
    try {
      stats.lastPollTime = Date.now();

      // Process events one by one with atomic lease acquisition
      let processedCount = 0;
      const maxBatchSize = config.batchSize;

      while (processedCount < maxBatchSize && isRunning) {
        // Atomically acquire lease on next available event
        const event = await OutboxEvent.findOneAndUpdate(
          {
            status: "pending",
            nextAttemptAt: { $lte: new Date() },
            attempts: { $lt: config.maxRetries },
            $or: [
              { lockedBy: null },
              { lockedUntil: { $lte: new Date() } }, // Reclaim stale locks
            ],
          },
          {
            $set: {
              lockedBy: workerId,
              lockedUntil: new Date(Date.now() + config.leaseDurationMs),
            },
          },
          {
            sort: { createdAt: 1 },
            new: true,
          },
        );

        // No more events to process
        if (!event) {
          break;
        }

        processedCount++;
        await processEvent(event, config);
      }

      stats.pendingEvents = processedCount;

      if (processedCount > 0) {
        console.log(
          `[OutboxWorker] Processed ${processedCount} events in this batch`,
        );
      }

      // Wait before next poll
      await sleep(config.pollIntervalMs);
    } catch (error) {
      console.error("[OutboxWorker] Poll loop error:", error);
      await sleep(config.pollIntervalMs);
    }
  }
}

/**
 * Process a single outbox event
 */
async function processEvent(
  event: IOutboxEvent,
  config: OutboxWorkerConfig,
): Promise<void> {
  // Ensure we're connected
  if (!rabbitClient?.isConnected()) {
    console.warn(
      "[OutboxWorker] RabbitMQ not connected, attempting reconnect...",
    );
    await connectWithBackoff();
  }

  try {
    // Determine routing key based on event type
    const routingKey = getRoutingKey(event.eventType);

    // Publish to RabbitMQ
    const published = await publishWithBackoff(event, routingKey);

    if (published) {
      // Mark as published and release lock
      await OutboxEvent.updateOne(
        { _id: event._id },
        {
          $set: {
            status: "published",
            publishedAt: new Date(),
            lockedBy: null,
            lockedUntil: null,
          },
        },
      );

      stats.totalPublished++;
      stats.lastPublishTime = Date.now();

      console.log(
        `[OutboxWorker] Published event ${event.eventId} (${event.eventType})`,
      );
    }
  } catch (error) {
    console.error(
      `[OutboxWorker] Failed to process event ${event.eventId}:`,
      error,
    );

    // Calculate next attempt time with exponential backoff
    const nextDelay = Math.min(
      1000 * Math.pow(2, event.attempts),
      60000, // Max 60 seconds
    );
    const nextAttemptAt = new Date(Date.now() + nextDelay);

    // Check if we've exceeded max retries
    const newAttempts = event.attempts + 1;
    const shouldFail = newAttempts >= config.maxRetries;

    if (shouldFail) {
      // Move to dead letter queue
      await handlePoisonEvent(event, error);
    } else {
      // Update event with retry info and release lock
      await OutboxEvent.updateOne(
        { _id: event._id },
        {
          $inc: { attempts: 1 },
          $set: {
            lastError: error instanceof Error ? error.message : "Unknown error",
            nextAttemptAt,
            lockedBy: null,
            lockedUntil: null,
          },
        },
      );

      console.log(
        `[OutboxWorker] Event ${event.eventId} failed (attempt ${newAttempts}/${config.maxRetries}), next attempt at ${nextAttemptAt.toISOString()}`,
      );
    }

    stats.totalFailed++;
  }
}

/**
 * Handle poison events that have exceeded max retries
 */
async function handlePoisonEvent(
  event: IOutboxEvent,
  error: unknown,
): Promise<void> {
  try {
    console.warn(
      `[OutboxWorker] Moving poison event ${event.eventId} to dead letter queue`,
    );

    // Create dead letter event
    await DeadLetterEvent.create({
      eventId: event.eventId,
      eventType: event.eventType,
      payload: event.payload,
      originalStatus: event.status,
      attempts: event.attempts + 1,
      lastError: error instanceof Error ? error.message : "Unknown error",
      movedAt: new Date(),
      reason: "max_retries_exceeded",
      originalCreatedAt: event.createdAt,
    });

    // Delete from outbox
    await OutboxEvent.deleteOne({ _id: event._id });

    stats.totalPoisonEvents++;

    // Increment poison events counter metric
    const counter = getPoisonEventsCounter();
    if (counter) {
      counter.inc();
    }

    console.log(
      `[OutboxWorker] Poison event ${event.eventId} moved to dead letter queue`,
    );
  } catch (dlqError) {
    console.error(
      `[OutboxWorker] Failed to move poison event ${event.eventId} to dead letter queue:`,
      dlqError,
    );

    // Fallback: mark as failed in outbox
    await OutboxEvent.updateOne(
      { _id: event._id },
      {
        $inc: { attempts: 1 },
        $set: {
          status: "failed",
          lastError:
            error instanceof Error
              ? error.message
              : "Unknown error (DLQ move failed)",
          lockedBy: null,
          lockedUntil: null,
        },
      },
    );
  }
}

/**
 * Publish event with exponential backoff
 */
async function publishWithBackoff(
  event: IOutboxEvent,
  routingKey: string,
): Promise<boolean> {
  const tracker = new BackoffTracker({
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    multiplier: 2,
    jitter: 0.1,
    maxRetries: 5, // Local retries before giving up on this attempt
  });

  while (!tracker.isMaxRetriesExceeded() && isRunning) {
    try {
      await rabbitClient!.publish(
        {
          eventId: event.eventId,
          eventType: event.eventType,
          payload: event.payload,
          createdAt: event.createdAt,
        },
        {
          routingKey,
          persistent: true,
          messageId: event.eventId,
        },
      );

      return true;
    } catch (error) {
      const delay = tracker.nextDelay();
      const stats = tracker.getStats();

      console.warn(
        `[OutboxWorker] RabbitMQ unavailable, retrying in ${delay}ms (attempt ${stats.totalAttempts}):`,
        error instanceof Error ? error.message : error,
      );

      // Check if we need to reconnect
      if (!rabbitClient?.isConnected()) {
        await connectWithBackoff();
      }

      await sleep(delay);
    }
  }

  throw new Error("Failed to publish after max retries");
}

/**
 * Get routing key for event type
 */
function getRoutingKey(eventType: string): string {
  switch (eventType) {
    case "ORDER_CREATED":
      return ROUTING_KEYS.ORDER_CREATED;
    case "ORDER_SHIPPED":
      return ROUTING_KEYS.ORDER_SHIPPED;
    case "ORDER_CANCELLED":
      return ROUTING_KEYS.INVENTORY_RELEASE;
    default:
      return eventType.toLowerCase().replace(/_/g, ".");
  }
}

/**
 * Stop the outbox worker
 */
export async function stopOutboxWorker(): Promise<void> {
  console.log("[OutboxWorker] Stopping...");
  isRunning = false;

  if (workerPromise) {
    await workerPromise;
  }

  if (rabbitClient) {
    await rabbitClient.disconnect();
    rabbitClient = null;
  }

  console.log("[OutboxWorker] Stopped");
}

/**
 * Check if worker is running
 */
export function isWorkerRunning(): boolean {
  return isRunning;
}

/**
 * Check if RabbitMQ is connected
 */
export function isRabbitMQConnected(): boolean {
  return rabbitClient?.isConnected() ?? false;
}

/**
 * Get worker statistics
 */
export function getWorkerStats() {
  return {
    ...stats,
    isRunning,
    isConnected: isRabbitMQConnected(),
    backoffStats: backoffTracker.getStats(),
  };
}

/**
 * Get count of pending outbox events
 */
export async function getPendingEventCount(): Promise<number> {
  return OutboxEvent.countDocuments({ status: "pending" });
}

/**
 * Get count of dead letter events
 */
export async function getDeadLetterEventCount(): Promise<number> {
  return DeadLetterEvent.countDocuments({});
}

/**
 * Get recent dead letter events (for monitoring)
 */
export async function getRecentDeadLetterEvents(limit = 10) {
  return DeadLetterEvent.find().sort({ movedAt: -1 }).limit(limit);
}
