/**
 * Circuit Breaker Pattern Implementation
 *
 * Protects the system from cascading failures by failing fast when
 * a downstream service is unavailable or slow.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Requests fail immediately without calling the service
 * - HALF_OPEN: Allow one test request to check if service recovered
 *
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes to close from half-open
  timeout: number; // Request timeout in ms
  resetTimeout: number; // Time to wait before trying again (ms)
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  totalTimeouts: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 2000,
  resetTimeout: 30000,
};

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private totalTimeouts = 0;
  private config: CircuitBreakerConfig;
  private name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === "OPEN") {
      if (this.shouldAttemptReset()) {
        console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`);
        this.state = "HALF_OPEN";
      } else {
        this.totalFailures++;
        throw new CircuitBreakerOpenError(
          `Circuit breaker ${this.name} is OPEN. Failing fast.`,
        );
      }
    }

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.totalTimeouts++;
        reject(
          new CircuitBreakerTimeoutError(
            `Request timed out after ${this.config.timeout}ms`,
          ),
        );
      }, this.config.timeout);

      fn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    this.totalSuccesses++;

    if (this.state === "HALF_OPEN") {
      this.successes++;
      console.log(
        `[CircuitBreaker:${this.name}] Success in HALF_OPEN (${this.successes}/${this.config.successThreshold})`,
      );

      if (this.successes >= this.config.successThreshold) {
        console.log(`[CircuitBreaker:${this.name}] Transitioning to CLOSED`);
        this.reset();
      }
    } else {
      // Reset failure count on success in CLOSED state
      this.failures = 0;
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(error: unknown): void {
    this.totalFailures++;
    this.failures++;
    this.lastFailureTime = Date.now();

    console.log(
      `[CircuitBreaker:${this.name}] Failure (${this.failures}/${this.config.failureThreshold}):`,
      error instanceof Error ? error.message : error,
    );

    if (this.state === "HALF_OPEN") {
      console.log(
        `[CircuitBreaker:${this.name}] Failed in HALF_OPEN, transitioning to OPEN`,
      );
      this.state = "OPEN";
      this.successes = 0;
    } else if (this.failures >= this.config.failureThreshold) {
      console.log(
        `[CircuitBreaker:${this.name}] Threshold reached, transitioning to OPEN`,
      );
      this.state = "OPEN";
    }
  }

  /**
   * Check if enough time has passed to attempt reset
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    return Date.now() - this.lastFailureTime >= this.config.resetTimeout;
  }

  /**
   * Reset the circuit breaker to closed state
   */
  private reset(): void {
    this.state = "CLOSED";
    this.failures = 0;
    this.successes = 0;
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === "OPEN" && this.shouldAttemptReset()) {
      return "HALF_OPEN";
    }
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      totalTimeouts: this.totalTimeouts,
    };
  }

  /**
   * Force open the circuit (for testing)
   */
  forceOpen(): void {
    this.state = "OPEN";
    this.lastFailureTime = Date.now();
  }

  /**
   * Force close the circuit (for testing)
   */
  forceClose(): void {
    this.reset();
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}

/**
 * Error thrown when request times out
 */
export class CircuitBreakerTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerTimeoutError";
  }
}
