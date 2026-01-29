/**
 * K6 Stress Testing Scenario
 * 
 * Gradually increases load to find system breaking point.
 * Monitors degradation as load increases.
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
  stages: CONFIG.stages.stress,
  thresholds: {
    http_req_duration: ['p(95)<8000'],      // More lenient for stress
    http_req_failed: ['rate<0.3'],          // Up to 30% failure acceptable
    checks: ['rate>0.7'],                    // 70% checks pass
  },
  tags: {
    test_type: 'stress',
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
    timeout: '12s',
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
    'status is valid': (r) =>
      r.status === 202 || r.status === 400 || r.status === 503 || r.status === 0,
  });

  // Variable delay - shorter under high load
  const currentVUs = __VU;
  const delayFactor = currentVUs > 50 ? 0.5 : 1;
  sleep(Math.random() * delayFactor + 0.2);
}

export function handleSummary(data) {
  console.log(`\n📊 Stress test completed. ${affectedOrders.length} affected orders collected`);
  return createSummary(data, affectedOrders);
}
