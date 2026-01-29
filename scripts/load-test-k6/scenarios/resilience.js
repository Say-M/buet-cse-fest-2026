/**
 * K6 Resilience Testing Scenario
 * 
 * Tests the system's resilience patterns:
 * - Circuit breaker protection
 * - Gremlin latency handling
 * - Schrödinger crash simulation
 * - Timeout management
 * - Idempotency
 * 
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { CONFIG } from '../lib/config.js';
import { generateOrderPayload, generateIdempotencyKey, isAffectedOrder, createOrderData } from '../lib/utils.js';
import { handleSummary as createSummary } from '../lib/artifacts.js';

// Custom metrics for tracking resilience patterns
const affectedOrdersCounter = new Counter('affected_orders_total');
const gremlinDelaysCounter = new Counter('gremlin_delays');
const circuitBreakerCounter = new Counter('circuit_breaker_hits');
const schrodingerCrashCounter = new Counter('schrodinger_crashes');
const orderLatency = new Trend('order_creation_duration');
const gremlinLatency = new Trend('http_req_duration_gremlin', true);

export const options = {
  stages: CONFIG.stages.resilience,
  thresholds: CONFIG.thresholds,
  tags: {
    test_type: 'resilience',
  },
};

// Global array to collect affected orders
const affectedOrders = [];

export default function () {
  const idempotencyKey = generateIdempotencyKey(__VU, __ITER);
  const payload = generateOrderPayload();
  payload.idempotencyKey = idempotencyKey;

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
    },
    timeout: '10s',
    tags: {
      name: 'CreateOrder',
      scenario: 'resilience',
    },
  };

  const startTime = Date.now();
  const res = http.post(
    `${CONFIG.baseURL}/api/orders`,
    JSON.stringify(payload),
    params
  );
  const duration = Date.now() - startTime;

  // Track latency
  orderLatency.add(duration);

  // Track gremlin-affected requests separately
  if (res.headers['X-Gremlin-Delay-Ms']) {
    gremlinLatency.add(duration);
  }

  // Create order data object
  const orderData = createOrderData(__VU, __ITER, idempotencyKey, res, duration);

  // Update counters based on detection
  if (orderData.gremlinDelay) {
    gremlinDelaysCounter.add(1);
  }

  if (orderData.circuitBreakerOpen) {
    circuitBreakerCounter.add(1);
  }

  if (orderData.schrodingerCrash) {
    schrodingerCrashCounter.add(1);
  }

  // Determine if this order is affected
  if (isAffectedOrder(res, duration)) {
    affectedOrdersCounter.add(1);
    affectedOrders.push(orderData);
  }

  // Validation checks
  check(res, {
    'request completed': (r) => r.status !== 0,
    'status is 202 or expected error': (r) =>
      r.status === 202 || r.status === 400 || r.status === 503 || r.status === 0,
    'response time reasonable': () => duration < 15000,
  }, {
    scenario: 'resilience',
    affected: isAffectedOrder(res, duration) ? 'true' : 'false',
  });

  // Additional check for successful orders
  if (res.status === 202) {
    check(res, {
      'has orderId': (r) => {
        try {
          const body = r.json();
          return body.orderId !== undefined && body.orderId !== '';
        } catch (e) {
          return false;
        }
      },
      'has status': (r) => {
        try {
          const body = r.json();
          return body.status !== undefined;
        } catch (e) {
          return false;
        }
      },
    });
  }

  // Vary the delay between requests
  sleep(Math.random() * 2 + 0.5); // 0.5-2.5 seconds
}

// Export summary with affected orders
export function handleSummary(data) {
  console.log(`\n📊 Collected ${affectedOrders.length} affected orders for analysis`);
  return createSummary(data, affectedOrders);
}
