/**
 * Gremlin Latency Simulation
 *
 * Introduces deterministic delays to simulate real-world network issues.
 * Used to test resilience patterns like circuit breakers and timeouts.
 *
 * @format
 */

import { createHash } from "crypto";

interface GremlinConfig {
  enabled: boolean;
  frequency: number; // Hash mod N for deterministic delays
  minDelayMs: number;
  maxDelayMs: number;
}

export interface SchrodingerConfig {
  enabled: boolean;
  probability: number; // 0.0 to 1.0 (e.g., 0.1 = 10% chance)
}

const defaultConfig: GremlinConfig = {
  enabled: process.env.GREMLIN_ENABLED === "true",
  frequency: parseInt(process.env.GREMLIN_FREQUENCY || "5", 10),
  minDelayMs: parseInt(process.env.GREMLIN_MIN_DELAY_MS || "5000", 10),
  maxDelayMs: parseInt(process.env.GREMLIN_MAX_DELAY_MS || "8000", 10),
};

const schrodingerConfig: SchrodingerConfig = {
  enabled: process.env.SCHRODINGER_ENABLED === "true",
  probability: parseFloat(process.env.SCHRODINGER_PROBABILITY || "0.1"),
};

let requestCounter = 0;
let totalDelays = 0;

/**
 * Check if the current request should be delayed (legacy - per instance)
 * @deprecated Use shouldDelayDeterministic for cross-instance consistency
 */
export function shouldDelay(config: GremlinConfig = defaultConfig): boolean {
  if (!config.enabled) {
    return false;
  }

  requestCounter++;
  return requestCounter % config.frequency === 0;
}

/**
 * Check if request should be delayed based on hash of request ID
 * Deterministic across all instances
 */
export function shouldDelayDeterministic(
  requestId: string,
  config: GremlinConfig = defaultConfig,
): boolean {
  if (!config.enabled) {
    return false;
  }

  // Hash the request ID and take modulo
  const hash = createHash("sha256").update(requestId).digest();
  const hashValue = hash.readUInt32BE(0);

  return hashValue % config.frequency === 0;
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
 * @deprecated Use maybeApplyGremlinLatencyDeterministic for cross-instance consistency
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
 * Apply gremlin latency deterministically based on request ID
 * Returns the delay applied (0 if no delay)
 */
export async function maybeApplyGremlinLatencyDeterministic(
  requestId: string,
  config: GremlinConfig = defaultConfig,
): Promise<number> {
  if (!shouldDelayDeterministic(requestId, config)) {
    return 0;
  }

  const delayMs = getDelayMs(config);
  totalDelays++;

  console.log(
    `[Gremlin] Applying deterministic latency: ${delayMs}ms for request ${requestId}`,
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
 * @deprecated Use gremlinMiddlewareDeterministic for cross-instance consistency
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

/**
 * Maybe crash after successful commit (Schrödinger simulation)
 * Returns true if crash was triggered (silent drop)
 */
export function maybeSchrodingerCrash(
  requestId: string,
  config: SchrodingerConfig = schrodingerConfig,
): boolean {
  if (!config.enabled) {
    return false;
  }

  // Deterministic based on request ID
  const hash = createHash("sha256")
    .update(requestId + "-schrodinger")
    .digest();
  const hashValue = hash.readUInt32BE(0);
  const normalizedValue = hashValue / 0xffffffff; // 0.0 to 1.0

  if (normalizedValue < config.probability) {
    console.error(
      `[Schrödinger] 💀 Crashing after commit for request ${requestId}`,
    );

    // Simulate various failure modes
    const mode = Math.floor(Math.random() * 3);
    if (mode === 0) {
      // Hard crash
      console.error("[Schrödinger] Mode: Hard crash (process.exit)");
      setTimeout(() => process.exit(1), 10); // Slight delay to log
      return true;
    } else if (mode === 1) {
      // Exception
      console.error("[Schrödinger] Mode: Exception throw");
      throw new Error("Schrödinger crash");
    } else {
      // Silent drop (connection close without response)
      console.error("[Schrödinger] Mode: Silent drop");
      return true; // Caller should NOT send response
    }
  }

  return false;
}

/**
 * Get Schrödinger configuration
 */
export function getSchrodingerConfig(): SchrodingerConfig {
  return schrodingerConfig;
}
