/**
 * Unit tests for gremlin latency (deterministic delay and getDelayMs)
 */

import { describe, expect, test } from "bun:test";
import {
  shouldDelayDeterministic,
  getDelayMs,
} from "./gremlin";

describe("shouldDelayDeterministic", () => {
  test("same requestId and config returns same result", () => {
    const config = {
      enabled: true,
      frequency: 5,
      minDelayMs: 1000,
      maxDelayMs: 2000,
    };
    const result1 = shouldDelayDeterministic("req-123", config);
    const result2 = shouldDelayDeterministic("req-123", config);
    expect(result1).toBe(result2);
  });

  test("returns false when enabled is false", () => {
    const config = {
      enabled: false,
      frequency: 5,
      minDelayMs: 1000,
      maxDelayMs: 2000,
    };
    expect(shouldDelayDeterministic("req-any", config)).toBe(false);
  });

  test("returns boolean", () => {
    const config = {
      enabled: true,
      frequency: 5,
      minDelayMs: 1000,
      maxDelayMs: 2000,
    };
    const result = shouldDelayDeterministic("req-xyz", config);
    expect(typeof result).toBe("boolean");
  });
});

describe("getDelayMs", () => {
  test("returns value within [minDelayMs, maxDelayMs] over multiple calls", () => {
    const config = {
      enabled: true,
      frequency: 5,
      minDelayMs: 5000,
      maxDelayMs: 8000,
    };
    for (let i = 0; i < 20; i++) {
      const delay = getDelayMs(config);
      expect(delay).toBeGreaterThanOrEqual(config.minDelayMs);
      expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
    }
  });
});
