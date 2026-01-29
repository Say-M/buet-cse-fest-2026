/**
 * Unit tests for circuit breaker
 */

import { describe, expect, test } from "bun:test";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from "./circuit-breaker";

describe("CircuitBreaker", () => {
  test("opens after failureThreshold failures and next execute throws CircuitBreakerOpenError", async () => {
    const cb = new CircuitBreaker("test", {
      failureThreshold: 2,
      successThreshold: 2,
      timeout: 5000,
      resetTimeout: 60000,
    });

    const failFn = () => Promise.reject(new Error("downstream error"));

    await expect(cb.execute(failFn)).rejects.toThrow("downstream error");
    await expect(cb.execute(failFn)).rejects.toThrow("downstream error");

    expect(cb.getState()).toBe("OPEN");

    await expect(cb.execute(() => Promise.resolve(1))).rejects.toThrow(
      CircuitBreakerOpenError,
    );
    await expect(cb.execute(() => Promise.resolve(1))).rejects.toThrow(
      "Circuit breaker test is OPEN",
    );
  });
});
