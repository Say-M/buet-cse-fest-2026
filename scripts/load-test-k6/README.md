# K6 Load Testing Suite

Production-grade load testing for e-commerce microservices using k6.

## Quick Start

### Prerequisites

1. Install k6:
   ```bash
   # macOS
   brew install k6
   
   # Windows
   choco install k6
   
   # Linux (Debian/Ubuntu)
   sudo gpg -k
   sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
   echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
   sudo apt-get update
   sudo apt-get install k6
   ```

2. Install jq (optional, for pretty JSON output):
   ```bash
   # macOS
   brew install jq
   
   # Windows
   choco install jq
   
   # Linux
   sudo apt-get install jq
   ```

### Run Complete Workflow

```bash
# From project root
bash scripts/run-load-test.sh [scenario]

# Examples
bash scripts/run-load-test.sh resilience
bash scripts/run-load-test.sh baseline
bash scripts/run-load-test.sh stress
bash scripts/run-load-test.sh spike
```

### Run Individual Steps

```bash
# 1. Start system
bash scripts/start-system.sh

# 2. Run specific test
cd scripts/load-test-k6
bash k6-runner.sh resilience

# 3. View results
cat artifacts/test-summary.txt
cat artifacts/affected-orders.json | jq '.summary'
```

## Test Scenarios

### Baseline
- **Duration:** 3 minutes
- **Load:** 10 concurrent users
- **Purpose:** Establish performance baseline
- **Thresholds:** Strict (p95 < 2s, < 5% errors)

### Stress
- **Duration:** 7 minutes
- **Load:** Ramps from 20 → 50 → 80 → 100 users
- **Purpose:** Find system breaking point
- **Thresholds:** Lenient (p95 < 8s, < 30% errors)

### Spike
- **Duration:** 2.5 minutes
- **Load:** Sudden spike to 200 users
- **Purpose:** Test auto-scaling and circuit breaker
- **Thresholds:** Very lenient (p95 < 10s, < 40% errors)

### Resilience (Recommended)
- **Duration:** 5 minutes
- **Load:** 20 → 50 users
- **Purpose:** Validate resilience patterns
- **Tests:**
  - Gremlin latency handling
  - Circuit breaker protection
  - Schrödinger crash recovery
  - Idempotency
  - Timeout management

## Artifacts

After each test run, artifacts are saved to `artifacts/`:

### affected-orders.json
JSON file containing all orders affected by resilience patterns:

```json
{
  "testRun": {
    "timestamp": "2026-01-29T10:30:00.000Z",
    "duration": 180000,
    "scenario": "resilience"
  },
  "summary": {
    "total": 125,
    "byCategory": {
      "gremlin_delays": 42,
      "circuit_breaker_hits": 18,
      "schrodinger_crashes": 7,
      "timeouts": 3,
      "errors": 5
    }
  },
  "orders": [...]
}
```

### test-summary.txt
Human-readable report with:
- Request statistics
- Response time percentiles
- Affected orders breakdown
- Resilience validation results
- Recommendations

### test-summary.json
Full k6 metrics in JSON format for programmatic analysis.

### test-results-raw.json
Raw k6 output for advanced analysis.

## Environment Variables

```bash
# Customize test execution
BASE_URL=http://localhost:3000 bash k6-runner.sh resilience

# Skip system startup (if already running)
SKIP_STARTUP=true bash scripts/run-load-test.sh resilience
```

## Validation Criteria

A test passes if:
1. System starts successfully with all health checks green
2. k6 test completes without aborting
3. Artifacts are generated successfully
4. Affected orders are properly categorized
5. Resilience patterns are detected and validated

## Troubleshooting

**"k6 is not installed"**
- Follow installation instructions above

**"System is not running"**
- Run `bash scripts/start-system.sh` first
- Check Docker is running
- Verify ports are not in use

**"Scenario file not found"**
- Check available scenarios: `ls scripts/load-test-k6/scenarios/`
- Use correct scenario name (without .js extension)

**High failure rate in tests**
- Expected behavior - system is being stress tested
- Check `affected-orders.json` for categorization
- Review circuit breaker and gremlin configurations

## Advanced Usage

### Custom K6 Options

```bash
# Run with custom parameters
k6 run \
  --vus 50 \
  --duration 5m \
  -e BASE_URL=http://localhost:3000 \
  scenarios/resilience.js
```

### CI/CD Integration

```bash
# Non-interactive mode for CI
SKIP_STARTUP=true bash scripts/run-load-test.sh resilience

# Check exit code
if [ $? -eq 0 ]; then
  echo "Tests passed"
else
  echo "Tests failed or had warnings"
fi
```

### View Results

```bash
# Quick summary with jq
cat artifacts/affected-orders.json | jq '{
  total: .summary.total,
  gremlin: .summary.byCategory.gremlin_delays,
  circuit_breaker: .summary.byCategory.circuit_breaker_hits
}'

# List all affected order IDs
cat artifacts/affected-orders.json | jq -r '.orders[].orderId' | grep -v null

# Count by category
cat artifacts/affected-orders.json | jq '.summary.byCategory'
```
