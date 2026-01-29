/**
 * K6 Spike Testing Scenario
 * 
 * Sudden traffic spike to test auto-scaling and circuit breaker.
 * Simulates flash sale or viral event.
 * 
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { CONFIG } from '../lib/config.js';
import { generateOrderPayload, generateIdempotencyKey, isAffectedOrder, createOrderData } from '../lib/utils.js';
import { handleSummary as createSummary } from '../lib/artifacts.js';

const affectedOrdersCounter = new Counter('affected_orders_total');
const orderLatency = new Trend('order_creation_duration');

export const options = {
  stages: CONFIG.stages.spike,
  thresholds: {
    http_req_duration: ['p(95)<10000'],     // Very lenient for spike
    http_req_failed: ['rate<0.4'],          // Up to 40% failure acceptable
    checks: ['rate>0.6'],                    // 60% checks pass
  },
  tags: {
    test_type: 'spike',
  },
};

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
    timeout: '15s',
    tags: { name: 'CreateOrder' },
  };

  const startTime = Date.now();
  const res = http.post(
    `${CONFIG.baseURL}/api/orders`,
    JSON.stringify(payload),
    params
  );
  const duration = Date.now() - startTime;

  orderLatency.add(duration);

  const orderData = createOrderData(__VU, __ITER, idempotencyKey, res, duration);

  if (isAffectedOrder(res, duration)) {
    affectedOrdersCounter.add(1);
    affectedOrders.push(orderData);
  }

  check(res, {
    'request completed': (r) => r.status !== 0,
  });

  // Minimal delay during spike
  sleep(0.1);
}

export function handleSummary(data) {
  console.log(`\n📊 Spike test completed. ${affectedOrders.length} affected orders collected`);
  return createSummary(data, affectedOrders);
}
