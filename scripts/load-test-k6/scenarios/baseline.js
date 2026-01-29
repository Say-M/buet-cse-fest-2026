/**
 * K6 Baseline Testing Scenario
 * 
 * Establishes baseline performance metrics under normal load.
 * Used to compare against stress and resilience tests.
 * 
 * @format
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { CONFIG } from '../lib/config.js';
import { generateOrderPayload, generateIdempotencyKey } from '../lib/utils.js';
import { handleSummary as createSummary } from '../lib/artifacts.js';

const orderLatency = new Trend('order_creation_duration');

export const options = {
  stages: CONFIG.stages.baseline,
  thresholds: {
    http_req_duration: ['p(95)<2000'],      // Stricter for baseline
    http_req_failed: ['rate<0.05'],         // Max 5% failure
    checks: ['rate>0.95'],                   // 95% checks pass
  },
  tags: {
    test_type: 'baseline',
  },
};

const affectedOrders = [];

export default function () {
  const idempotencyKey = generateIdempotencyKey(__VU, __ITER);
  const payload = generateOrderPayload({ numItems: 1 }); // Single item for baseline
  payload.idempotencyKey = idempotencyKey;

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
    },
    timeout: '5s',
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

  // Baseline should have minimal affected orders
  if (res.headers['X-Gremlin-Delay-Ms'] || res.status !== 202) {
    affectedOrders.push({
      vu: __VU,
      iter: __ITER,
      httpStatus: res.status,
      duration,
      gremlinDelay: res.headers['X-Gremlin-Delay-Ms']
        ? parseInt(res.headers['X-Gremlin-Delay-Ms'])
        : null,
    });
  }

  check(res, {
    'status is 202': (r) => r.status === 202,
    'has orderId': (r) => {
      try {
        return r.json('orderId') !== undefined;
      } catch (e) {
        return false;
      }
    },
    'response time < 2s': () => duration < 2000,
  });

  sleep(1);
}

export function handleSummary(data) {
  return createSummary(data, affectedOrders);
}
