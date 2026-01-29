/**
 * Exponential Backoff with Jitter
 *
 * Used by the outbox worker to retry publishing to RabbitMQ when the broker is unavailable.
 * Prevents thundering herd problem with jitter.
 *
 * @format
 */

export interface BackoffConfig {
  initialDelayMs: number; // Initial delay in milliseconds
  maxDelayMs: number; // Maximum delay cap
  multiplier: number; // Multiplier for each retry
  jitter: number; // Jitter factor (0-1)
  maxRetries?: number; // Maximum number of retries (undefined = infinite)
}

const DEFAULT_CONFIG: BackoffConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  jitter: 0.1,
};

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  config: BackoffConfig = DEFAULT_CONFIG,
): number {
  // Calculate base delay: initialDelay * multiplier^(attempt-1)
  const baseDelay =
    config.initialDelayMs * Math.pow(config.multiplier, attempt - 1);

  // Cap at maxDelay
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs);

  // Add jitter: delay * (1 ± jitter/2)
  const jitterRange = cappedDelay * config.jitter;
  const jitteredDelay = cappedDelay + (Math.random() - 0.5) * 2 * jitterRange;

  return Math.round(jitteredDelay);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with exponential backoff retry
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<BackoffConfig> = {},
  onRetry?: (attempt: number, delay: number, error: Error) => void,
): Promise<T> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  let attempt = 0;

  while (true) {
    attempt++;

    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Check if we've exceeded max retries
      if (
        mergedConfig.maxRetries !== undefined &&
        attempt >= mergedConfig.maxRetries
      ) {
        throw new MaxRetriesExceededError(
          `Max retries (${mergedConfig.maxRetries}) exceeded`,
          err,
        );
      }

      const delay = calculateBackoffDelay(attempt, mergedConfig);

      if (onRetry) {
        onRetry(attempt, delay, err);
      }

      await sleep(delay);
    }
  }
}

/**
 * Create a backoff iterator for manual control
 */
export function* createBackoffIterator(
  config: Partial<BackoffConfig> = {},
): Generator<number, void, void> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  let attempt = 1;

  while (true) {
    if (
      mergedConfig.maxRetries !== undefined &&
      attempt > mergedConfig.maxRetries
    ) {
      return;
    }

    yield calculateBackoffDelay(attempt, mergedConfig);
    attempt++;
  }
}

/**
 * Error thrown when max retries exceeded
 */
export class MaxRetriesExceededError extends Error {
  public readonly cause: Error;

  constructor(message: string, cause: Error) {
    super(message);
    this.name = "MaxRetriesExceededError";
    this.cause = cause;
  }
}

/**
 * Backoff statistics for monitoring
 */
export interface BackoffStats {
  totalAttempts: number;
  totalDelayMs: number;
  lastAttemptTime: number | null;
}

/**
 * Create a stateful backoff tracker
 */
export class BackoffTracker {
  private config: BackoffConfig;
  private attempt = 0;
  private totalDelayMs = 0;
  private lastAttemptTime: number | null = null;

  constructor(config: Partial<BackoffConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get next delay and increment attempt counter
   */
  nextDelay(): number {
    this.attempt++;
    this.lastAttemptTime = Date.now();
    const delay = calculateBackoffDelay(this.attempt, this.config);
    this.totalDelayMs += delay;
    return delay;
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.attempt = 0;
    this.totalDelayMs = 0;
    this.lastAttemptTime = null;
  }

  /**
   * Get current statistics
   */
  getStats(): BackoffStats {
    return {
      totalAttempts: this.attempt,
      totalDelayMs: this.totalDelayMs,
      lastAttemptTime: this.lastAttemptTime,
    };
  }

  /**
   * Check if max retries exceeded
   */
  isMaxRetriesExceeded(): boolean {
    if (this.config.maxRetries === undefined) return false;
    return this.attempt >= this.config.maxRetries;
  }
}
