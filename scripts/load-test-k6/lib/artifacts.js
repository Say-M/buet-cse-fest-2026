/**
 * K6 Artifact Collection Module
 * Handles collection and export of affected orders and test metrics
 * @format
 */

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
import { categorizeOrders } from './utils.js';

/**
 * Generate human-readable text report
 */
function generateTextReport(data, affectedOrders) {
  const categories = categorizeOrders(affectedOrders);

  return `
========================================
LOAD TEST REPORT
========================================

TEST RUN INFORMATION
--------------------
Start Time:     ${new Date(data.state.testStartTime).toISOString()}
Duration:       ${(data.state.testRunDurationMs / 1000).toFixed(2)}s
Scenario:       ${data.root_group.name || 'unknown'}

REQUEST STATISTICS
------------------
Total Requests: ${data.metrics.http_reqs?.values.count || 0}
Failed:         ${data.metrics.http_req_failed?.values.passes || 0}
Success Rate:   ${(((data.metrics.http_reqs?.values.count || 0) - (data.metrics.http_req_failed?.values.passes || 0)) / (data.metrics.http_reqs?.values.count || 1) * 100).toFixed(2)}%

RESPONSE TIMES
--------------
Average:        ${data.metrics.http_req_duration?.values.avg?.toFixed(2) || 0}ms
Min:            ${data.metrics.http_req_duration?.values.min?.toFixed(2) || 0}ms
Max:            ${data.metrics.http_req_duration?.values.max?.toFixed(2) || 0}ms
p50:            ${data.metrics.http_req_duration?.values['p(50)']?.toFixed(2) || 0}ms
p95:            ${data.metrics.http_req_duration?.values['p(95)']?.toFixed(2) || 0}ms
p99:            ${data.metrics.http_req_duration?.values['p(99)']?.toFixed(2) || 0}ms

AFFECTED ORDERS SUMMARY
-----------------------
Total Affected:          ${categories.total}
  Gremlin Delays:        ${categories.gremlin_delays}
  Circuit Breaker Hits:  ${categories.circuit_breaker_hits}
  Schrödinger Crashes:   ${categories.schrodinger_crashes}
  Timeouts:              ${categories.timeouts}
  Errors:                ${categories.errors}
  Successful Despite:    ${categories.successful_despite_issues}

CUSTOM METRICS
--------------
Affected Orders:        ${data.metrics.affected_orders_total?.values.count || 0}
Gremlin Delays:         ${data.metrics.gremlin_delays?.values.count || 0}
Circuit Breaker Hits:   ${data.metrics.circuit_breaker_hits?.values.count || 0}
Schrödinger Crashes:    ${data.metrics.schrodinger_crashes?.values.count || 0}

RESILIENCE VALIDATION
---------------------
${categories.gremlin_delays > 0 ? '✓' : '✗'} Gremlin Latency Detected
${categories.circuit_breaker_hits > 0 || data.metrics.circuit_breaker_hits?.values.count > 0 ? '✓' : '✗'} Circuit Breaker Active
${categories.successful_despite_issues > 0 ? '✓' : '✗'} Resilience Patterns Working
${(data.metrics.checks?.values.rate || 0) > 0.8 ? '✓' : '✗'} Check Success Rate > 80%

RECOMMENDATIONS
---------------
${(data.metrics.http_req_failed?.values.rate || 0) > 0.1 ? '⚠ High failure rate - investigate error logs' : '✓ Acceptable failure rate'}
${(data.metrics.http_req_duration?.values['p(95)'] || 0) > 5000 ? '⚠ High p95 latency - consider scaling' : '✓ Response times within acceptable range'}
${categories.timeouts > 10 ? '⚠ Multiple timeouts detected - check circuit breaker configuration' : '✓ Minimal timeouts'}

========================================
END OF REPORT
========================================
`;
}

/**
 * Main summary handler - exports all artifacts
 */
export function handleSummary(data, affectedOrders = []) {
  const categories = categorizeOrders(affectedOrders);

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'artifacts/test-summary.json': JSON.stringify(data, null, 2),
    'artifacts/affected-orders.json': JSON.stringify({
      testRun: {
        timestamp: new Date(data.state.testStartTime).toISOString(),
        duration: data.state.testRunDurationMs,
        scenario: data.root_group.name || 'unknown',
      },
      summary: {
        total: categories.total,
        byCategory: {
          gremlin_delays: categories.gremlin_delays,
          circuit_breaker_hits: categories.circuit_breaker_hits,
          schrodinger_crashes: categories.schrodinger_crashes,
          timeouts: categories.timeouts,
          errors: categories.errors,
          successful_despite_issues: categories.successful_despite_issues,
        },
      },
      orders: affectedOrders,
    }, null, 2),
    'artifacts/test-summary.txt': generateTextReport(data, affectedOrders),
  };
}
