/**
 * Gremlin Latency Simulation
 *
 * Introduces deterministic delays to simulate real-world network issues.
 * Used to test resilience patterns like circuit breakers and timeouts.
 *
 * @format
 */

interface GremlinConfig {
  enabled: boolean;
  frequency: number; // Every Nth request gets delayed
  minDelayMs: number;
  maxDelayMs: number;
}

const defaultConfig: GremlinConfig = {
  enabled: process.env.GREMLIN_ENABLED === "true",
  frequency: parseInt(process.env.GREMLIN_FREQUENCY || "5", 10),
  minDelayMs: parseInt(process.env.GREMLIN_MIN_DELAY_MS || "5000", 10),
  maxDelayMs: parseInt(process.env.GREMLIN_MAX_DELAY_MS || "8000", 10),
};

let requestCounter = 0;
let totalDelays = 0;

/**
 * Check if the current request should be delayed
 */
export function shouldDelay(config: GremlinConfig = defaultConfig): boolean {
  if (!config.enabled) {
    return false;
  }

  requestCounter++;
  return requestCounter % config.frequency === 0;
}

/**
 * Get a random delay between min and max
 */
export function getDelayMs(config: GremlinConfig = defaultConfig): number {
  const range = config.maxDelayMs - config.minDelayMs;
  return config.minDelayMs + Math.floor(Math.random() * range);
}

/**
 * Apply gremlin latency if conditions are met
 * Returns the delay applied (0 if no delay)
 */
export async function maybeApplyGremlinLatency(
  config: GremlinConfig = defaultConfig,
): Promise<number> {
  if (!shouldDelay(config)) {
    return 0;
  }

  const delayMs = getDelayMs(config);
  totalDelays++;

  console.log(
    `[Gremlin] Applying latency: ${delayMs}ms (request #${requestCounter}, total delays: ${totalDelays})`,
  );

  await sleep(delayMs);
  return delayMs;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get gremlin statistics
 */
export function getGremlinStats(): {
  enabled: boolean;
  totalRequests: number;
  totalDelays: number;
  config: GremlinConfig;
} {
  return {
    enabled: defaultConfig.enabled,
    totalRequests: requestCounter,
    totalDelays,
    config: defaultConfig,
  };
}

/**
 * Reset gremlin counters (useful for testing)
 */
export function resetGremlinCounters(): void {
  requestCounter = 0;
  totalDelays = 0;
}

/**
 * Hono middleware for applying gremlin latency
 */
export function gremlinMiddleware(config: GremlinConfig = defaultConfig) {
  return async (c: any, next: () => Promise<void>) => {
    const delayApplied = await maybeApplyGremlinLatency(config);

    if (delayApplied > 0) {
      c.header("X-Gremlin-Delay-Ms", delayApplied.toString());
    }

    await next();
  };
}
