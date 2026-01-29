/**
 * K6 Load Test Utilities
 * Helper functions for test scenarios
 * @format
 */

import { randomProduct, randomQuantity, randomPrice, generateCustomerId } from './config.js';

/**
 * Generate a random order payload
 */
export function generateOrderPayload(options = {}) {
  const numItems = options.numItems || Math.floor(Math.random() * 3) + 1;
  const items = [];

  for (let i = 0; i < numItems; i++) {
    items.push({
      productId: randomProduct(),
      quantity: randomQuantity(),
      price: options.fixedPrice || randomPrice(),
    });
  }

  return {
    customerId: options.customerId || generateCustomerId(),
    items,
  };
}

/**
 * Generate unique idempotency key
 */
export function generateIdempotencyKey(vu, iter) {
  return `test-${vu}-${iter}-${Date.now()}`;
}

/**
 * Check if response indicates affected order
 */
export function isAffectedOrder(res, duration) {
  // An order is "affected" if:
  // 1. Gremlin latency was applied
  // 2. Circuit breaker was triggered
  // 3. Response time > 5 seconds
  // 4. Connection dropped (Schrödinger)
  // 5. Any error occurred

  const hasGremlin = res.headers['X-Gremlin-Delay-Ms'] !== undefined;
  const circuitOpen = res.headers['X-Circuit-State'] === 'OPEN';
  const slowResponse = duration > 5000;
  const connectionDropped = res.status === 0;
  const hasError = res.status >= 400 || res.status === 0;

  return hasGremlin || circuitOpen || slowResponse || connectionDropped || hasError;
}

/**
 * Create order data object for artifact collection
 */
export function createOrderData(vu, iter, idempotencyKey, res, duration) {
  const orderData = {
    vu,
    iter,
    idempotencyKey,
    timestamp: new Date().toISOString(),
    httpStatus: res.status,
    duration,
    orderId: null,
    gremlinDelay: null,
    circuitBreakerOpen: false,
    schrodingerCrash: false,
    timeout: false,
    error: null,
  };

  // Extract gremlin delay
  if (res.headers['X-Gremlin-Delay-Ms']) {
    orderData.gremlinDelay = parseInt(res.headers['X-Gremlin-Delay-Ms']);
  }

  // Extract circuit breaker state
  if (res.headers['X-Circuit-State']) {
    orderData.circuitBreakerOpen = res.headers['X-Circuit-State'] === 'OPEN';
  }

  // Check for connection drop (Schrödinger)
  if (res.status === 0) {
    orderData.schrodingerCrash = true;
    orderData.error = 'Connection dropped';
  }

  // Check for timeout
  if (duration >= 10000) {
    orderData.timeout = true;
  }

  // Extract order ID and error from response
  if (res.status === 202) {
    try {
      const body = res.json();
      orderData.orderId = body.orderId;
    } catch (e) {
      orderData.error = 'Failed to parse response';
    }
  } else if (res.status >= 400) {
    try {
      const body = res.json();
      orderData.error = body.message || `HTTP ${res.status}`;
    } catch (e) {
      orderData.error = `HTTP ${res.status}`;
    }
  }

  return orderData;
}

/**
 * Categorize orders by issue type
 */
export function categorizeOrders(orders) {
  return {
    total: orders.length,
    gremlin_delays: orders.filter(o => o.gremlinDelay).length,
    circuit_breaker_hits: orders.filter(o => o.circuitBreakerOpen).length,
    schrodinger_crashes: orders.filter(o => o.schrodingerCrash).length,
    timeouts: orders.filter(o => o.timeout).length,
    errors: orders.filter(o => o.error && !o.schrodingerCrash).length,
    successful_despite_issues: orders.filter(o => o.orderId && (o.gremlinDelay || o.duration > 5000)).length,
  };
}
