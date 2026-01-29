/**
 * Unit tests for exponential backoff and jitter
 * @format
 */

import { describe, expect, test } from "bun:test";
import {
  calculateBackoffDelay,
  type BackoffConfig,
} from "./backoff";

describe("calculateBackoffDelay", () => {
  test("attempt 1 returns delay within jitter range when Math.random is fixed", () => {
    const config: BackoffConfig = {
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      multiplier: 2,
      jitter: 0.1,
    };
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
      const delay = calculateBackoffDelay(1, config);
      // With jitter 0.5 (midpoint): jitteredDelay = 1000, round = 1000
      expect(delay).toBeGreaterThanOrEqual(900);
      expect(delay).toBeLessThanOrEqual(1100);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("attempt 2 gives larger delay than attempt 1 (exponential growth)", () => {
    const config: BackoffConfig = {
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      multiplier: 2,
      jitter: 0,
    };
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
      const delay1 = calculateBackoffDelay(1, config);
      const delay2 = calculateBackoffDelay(2, config);
      // attempt 1: 1000 * 2^0 = 1000; attempt 2: 1000 * 2^1 = 2000
      expect(delay2).toBeGreaterThan(delay1);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("delay is capped at maxDelayMs", () => {
    const config: BackoffConfig = {
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      multiplier: 10,
      jitter: 0,
    };
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
      const delay = calculateBackoffDelay(5, config);
      // 1000 * 10^4 = 10_000_000, capped at 5000
      expect(delay).toBeLessThanOrEqual(5500); // allow small jitter if any
      expect(delay).toBeGreaterThanOrEqual(4500);
    } finally {
      Math.random = originalRandom;
    }
  });
});
