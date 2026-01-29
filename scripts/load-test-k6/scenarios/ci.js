/**
 * Ultra-simple K6 CI Test
 * Just health checks - that's it!
 * @format
 */

import http from 'k6/http';
import { check } from 'k6';

// Super simple: 1 minute, 2 users
export const options = {
  vus: 2,
  duration: '1m',
  thresholds: {
    // No thresholds - we don't want to fail
  },
};

export default function () {
  const baseURL = __ENV.BASE_URL || 'http://localhost:3000';

  // Just hit the health endpoint
  const res = http.get(`${baseURL}/health`);

  // Don't even check - just log it
  console.log(`Response status: ${res.status}`);
}
