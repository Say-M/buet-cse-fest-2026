#!/usr/bin/env bun
/**
 * Load Test Script for E-commerce Microservices
 *
 * This script:
 * 1. Creates multiple orders concurrently
 * 2. Records response times and identifies slow responses (gremlin latency)
 * 3. Monitors circuit breaker state
 * 4. Generates a summary report
 *
 * Usage:
 *   bun run index.ts [options]
 *
 * Options:
 *   --gateway=URL        Gateway URL (default: http://localhost:3000)
 *   --requests=N         Total number of requests (default: 50)
 *   --concurrency=N      Concurrent requests (default: 5)
 *   --timeout=MS         Request timeout in ms (default: 10000)
 *
 * @format
 */

const GATEWAY_URL =
  process.env.GATEWAY_URL || getArg("gateway") || "http://localhost:3000";
const TOTAL_REQUESTS = parseInt(getArg("requests") || "50", 10);
const CONCURRENCY = parseInt(getArg("concurrency") || "5", 10);
const TIMEOUT_MS = parseInt(getArg("timeout") || "10000", 10);

interface TestResult {
  requestId: number;
  orderId: string | null;
  status: "success" | "timeout" | "error" | "circuit_open";
  responseTime: number;
  httpStatus: number | null;
  gremlinDelay: number | null;
  circuitState: string | null;
  error: string | null;
  timestamp: Date;
}

interface TestSummary {
  totalRequests: number;
  successful: number;
  failed: number;
  timeouts: number;
  circuitOpen: number;
  gremlinDelays: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
  totalDuration: number;
}

const results: TestResult[] = [];
let completedRequests = 0;

function getArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg?.split("=")[1];
}

function generateOrderPayload() {
  const customerId = `CUST-${Math.random().toString(36).substring(2, 10)}`;
  const productIds = [
    "PROD-001",
    "PROD-002",
    "PROD-003",
    "PROD-004",
    "PROD-005",
  ];
  const numItems = Math.floor(Math.random() * 3) + 1;

  const items = [];
  for (let i = 0; i < numItems; i++) {
    items.push({
      productId: productIds[Math.floor(Math.random() * productIds.length)],
      quantity: Math.floor(Math.random() * 3) + 1,
      price: Math.floor(Math.random() * 100) + 10,
    });
  }

  return {
    customerId,
    items,
    idempotencyKey: crypto.randomUUID(),
  };
}

async function createOrder(requestId: number): Promise<TestResult> {
  const startTime = Date.now();
  const payload = generateOrderPayload();

  const result: TestResult = {
    requestId,
    orderId: null,
    status: "error",
    responseTime: 0,
    httpStatus: null,
    gremlinDelay: null,
    circuitState: null,
    error: null,
    timestamp: new Date(),
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${GATEWAY_URL}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": payload.idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    result.responseTime = Date.now() - startTime;
    result.httpStatus = response.status;
    result.circuitState = response.headers.get("X-Circuit-State");
    result.gremlinDelay = response.headers.get("X-Gremlin-Delay-Ms")
      ? parseInt(response.headers.get("X-Gremlin-Delay-Ms")!, 10)
      : null;

    if (response.ok) {
      const data = await response.json();
      result.orderId = data.orderId;
      result.status = "success";
    } else if (response.status === 503) {
      const data = await response.json();
      if (data.message?.includes("circuit breaker")) {
        result.status = "circuit_open";
      } else {
        result.status = "error";
      }
      result.error = data.message;
    } else {
      const data = await response.json();
      result.status = "error";
      result.error = data.message || `HTTP ${response.status}`;
    }
  } catch (error) {
    result.responseTime = Date.now() - startTime;

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        result.status = "timeout";
        result.error = `Request timed out after ${TIMEOUT_MS}ms`;
      } else {
        result.status = "error";
        result.error = error.message;
      }
    }
  }

  return result;
}

async function runLoadTest(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("E-COMMERCE MICROSERVICES LOAD TEST");
  console.log("=".repeat(60));
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log(`Total Requests: ${TOTAL_REQUESTS}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log("=".repeat(60) + "\n");

  // Check if services are up
  console.log("Checking service health...");
  try {
    const healthResponse = await fetch(`${GATEWAY_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const healthData = await healthResponse.json();
    console.log(`Gateway health: ${healthData.status}`);
    if (healthData.services) {
      Object.entries(healthData.services).forEach(
        ([service, data]: [string, any]) => {
          console.log(`  ${service}: ${data.status}`);
        },
      );
    }
  } catch (error) {
    console.error(
      "❌ Failed to connect to gateway. Make sure services are running.",
    );
    console.error("   Run: docker compose -f docker-compose.dev.yml up -d");
    process.exit(1);
  }

  console.log("\nStarting load test...\n");

  const startTime = Date.now();
  const queue: Promise<void>[] = [];
  let requestId = 0;

  // Progress display
  const progressInterval = setInterval(() => {
    const progress = Math.round((completedRequests / TOTAL_REQUESTS) * 100);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(
      `\rProgress: ${completedRequests}/${TOTAL_REQUESTS} (${progress}%) - ${elapsed}s elapsed`,
    );
  }, 100);

  // Create request queue with concurrency limit
  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    if (queue.length >= CONCURRENCY) {
      await Promise.race(queue);
    }

    const currentRequestId = ++requestId;
    const promise = createOrder(currentRequestId).then((result) => {
      results.push(result);
      completedRequests++;
      queue.splice(queue.indexOf(promise), 1);
    });

    queue.push(promise);
  }

  // Wait for remaining requests
  await Promise.all(queue);
  clearInterval(progressInterval);

  const totalDuration = (Date.now() - startTime) / 1000;

  console.log("\n\n" + "=".repeat(60));
  console.log("TEST COMPLETE");
  console.log("=".repeat(60) + "\n");

  // Generate and display summary
  const summary = generateSummary(totalDuration);
  displaySummary(summary);
  displayDetailedResults();
}

function generateSummary(totalDuration: number): TestSummary {
  const successful = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;
  const timeouts = results.filter((r) => r.status === "timeout").length;
  const circuitOpen = results.filter((r) => r.status === "circuit_open").length;
  const gremlinDelays = results.filter((r) => r.gremlinDelay !== null).length;

  const responseTimes = results
    .map((r) => r.responseTime)
    .sort((a, b) => a - b);
  const avgResponseTime =
    responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

  const p50Index = Math.floor(responseTimes.length * 0.5);
  const p95Index = Math.floor(responseTimes.length * 0.95);
  const p99Index = Math.floor(responseTimes.length * 0.99);

  return {
    totalRequests: results.length,
    successful,
    failed,
    timeouts,
    circuitOpen,
    gremlinDelays,
    avgResponseTime: Math.round(avgResponseTime),
    minResponseTime: responseTimes[0],
    maxResponseTime: responseTimes[responseTimes.length - 1],
    p50ResponseTime: responseTimes[p50Index],
    p95ResponseTime: responseTimes[p95Index],
    p99ResponseTime: responseTimes[p99Index],
    requestsPerSecond: Math.round((results.length / totalDuration) * 100) / 100,
    totalDuration,
  };
}

function displaySummary(summary: TestSummary): void {
  console.log("SUMMARY");
  console.log("-".repeat(40));
  console.log(`Total Requests:      ${summary.totalRequests}`);
  console.log(
    `Successful:          ${summary.successful} (${Math.round((summary.successful / summary.totalRequests) * 100)}%)`,
  );
  console.log(`Failed:              ${summary.failed}`);
  console.log(`Timeouts:            ${summary.timeouts}`);
  console.log(`Circuit Open:        ${summary.circuitOpen}`);
  console.log(`Gremlin Delays:      ${summary.gremlinDelays}`);
  console.log("-".repeat(40));
  console.log(`Avg Response Time:   ${summary.avgResponseTime}ms`);
  console.log(`Min Response Time:   ${summary.minResponseTime}ms`);
  console.log(`Max Response Time:   ${summary.maxResponseTime}ms`);
  console.log(`P50 Response Time:   ${summary.p50ResponseTime}ms`);
  console.log(`P95 Response Time:   ${summary.p95ResponseTime}ms`);
  console.log(`P99 Response Time:   ${summary.p99ResponseTime}ms`);
  console.log("-".repeat(40));
  console.log(`Total Duration:      ${summary.totalDuration.toFixed(2)}s`);
  console.log(`Requests/Second:     ${summary.requestsPerSecond}`);
  console.log();
}

function displayDetailedResults(): void {
  // Show slow requests (gremlin delays)
  const slowRequests = results.filter(
    (r) => r.gremlinDelay !== null || r.responseTime > 2000,
  );
  if (slowRequests.length > 0) {
    console.log("SLOW REQUESTS (Gremlin Latency / > 2s)");
    console.log("-".repeat(40));
    slowRequests.slice(0, 10).forEach((r) => {
      const gremlin = r.gremlinDelay ? ` (gremlin: ${r.gremlinDelay}ms)` : "";
      console.log(
        `  #${r.requestId}: ${r.responseTime}ms - ${r.status}${gremlin}`,
      );
    });
    if (slowRequests.length > 10) {
      console.log(`  ... and ${slowRequests.length - 10} more`);
    }
    console.log();
  }

  // Show circuit breaker events
  const circuitOpenResults = results.filter((r) => r.status === "circuit_open");
  if (circuitOpenResults.length > 0) {
    console.log("CIRCUIT BREAKER EVENTS");
    console.log("-".repeat(40));
    circuitOpenResults.slice(0, 5).forEach((r) => {
      console.log(`  #${r.requestId}: ${r.error}`);
    });
    if (circuitOpenResults.length > 5) {
      console.log(`  ... and ${circuitOpenResults.length - 5} more`);
    }
    console.log();
  }

  // Show errors
  const errors = results.filter(
    (r) => r.status === "error" || r.status === "timeout",
  );
  if (errors.length > 0) {
    console.log("ERRORS");
    console.log("-".repeat(40));
    errors.slice(0, 5).forEach((r) => {
      console.log(`  #${r.requestId}: ${r.status} - ${r.error}`);
    });
    if (errors.length > 5) {
      console.log(`  ... and ${errors.length - 5} more`);
    }
    console.log();
  }

  // Resilience assessment
  console.log("RESILIENCE ASSESSMENT");
  console.log("-".repeat(40));

  const successRate =
    results.filter((r) => r.status === "success").length / results.length;
  const hasGremlinHandling = results.some(
    (r) => r.gremlinDelay !== null && r.status === "success",
  );
  const hasCircuitBreaker = results.some((r) => r.circuitState !== null);

  if (successRate >= 0.9) {
    console.log("✅ High success rate (>90%) - System handles load well");
  } else if (successRate >= 0.7) {
    console.log("⚠️  Moderate success rate (70-90%) - Some issues under load");
  } else {
    console.log("❌ Low success rate (<70%) - System struggles under load");
  }

  if (hasGremlinHandling) {
    console.log("✅ Gremlin latency detected and handled correctly");
  }

  if (hasCircuitBreaker) {
    console.log("✅ Circuit breaker is active and protecting the system");
  }

  const avgTime =
    results.reduce((a, r) => a + r.responseTime, 0) / results.length;
  if (avgTime < 1000) {
    console.log("✅ Average response time under 1 second");
  } else {
    console.log("⚠️  Average response time exceeds 1 second");
  }

  console.log("\n" + "=".repeat(60) + "\n");
}

// Run the test
runLoadTest().catch(console.error);
