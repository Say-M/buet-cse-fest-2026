/**
 * K6 Load Test Configuration
 * Shared configuration for all test scenarios
 * @format
 */

export const CONFIG = {
  baseURL: __ENV.BASE_URL || 'http://localhost:3000',

  // Test stages for different scenarios
  stages: {
    ci: [
      { duration: '30s', target: 5 },    // Ramp up to 5 VUs
      { duration: '1m', target: 5 },     // Stay at 5 VUs
      { duration: '30s', target: 0 },    // Ramp down
    ],
    baseline: [
      { duration: '30s', target: 10 },   // Ramp up to 10 VUs
      { duration: '2m', target: 10 },    // Stay at 10 VUs
      { duration: '30s', target: 0 },    // Ramp down
    ],
    stress: [
      { duration: '1m', target: 20 },
      { duration: '2m', target: 50 },
      { duration: '2m', target: 80 },
      { duration: '1m', target: 100 },
      { duration: '1m', target: 0 },
    ],
    spike: [
      { duration: '30s', target: 10 },
      { duration: '30s', target: 200 },  // Sudden spike
      { duration: '1m', target: 10 },
      { duration: '30s', target: 0 },
    ],
    resilience: [
      { duration: '1m', target: 20 },
      { duration: '3m', target: 50 },
      { duration: '1m', target: 0 },
    ],
  },

  // Thresholds for test validation
  thresholds: {
    http_req_duration: ['p(95)<5000'],         // 95% under 5s
    http_req_failed: ['rate<0.2'],             // Error rate < 20%
    http_req_duration_gremlin: ['p(95)<10000'], // Gremlin-affected requests
    checks: ['rate>0.8'],                      // 80% checks pass
  },
};

// Test products
export const PRODUCTS = [
  'PROD-001',
  'PROD-002',
  'PROD-003',
  'PROD-004',
  'PROD-005'
];

// Customer ID generator
export function generateCustomerId() {
  return `CUST-${Math.random().toString(36).substring(2, 11)}`;
}

// Random product selector
export function randomProduct() {
  return PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
}

// Random quantity between 1 and 5
export function randomQuantity() {
  return Math.floor(Math.random() * 5) + 1;
}

// Random price between 10 and 200
export function randomPrice() {
  return Math.floor(Math.random() * 190) + 10;
}
