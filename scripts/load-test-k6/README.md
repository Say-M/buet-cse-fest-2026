# K6 Load Tests

## Install k6

```bash
# macOS
brew install k6

# Linux
sudo apt-get install k6
```

## Run Tests

```bash
# Full workflow
bash scripts/run-load-test.sh [scenario]

# Scenarios
bash scripts/run-load-test.sh ci          # CI: 2min, 5 VUs
bash scripts/run-load-test.sh baseline    # Baseline: 3min, 10 VUs
bash scripts/run-load-test.sh resilience  # Resilience: 5min, 20-50 VUs
bash scripts/run-load-test.sh stress      # Stress: 7min, up to 100 VUs
bash scripts/run-load-test.sh spike       # Spike: 2.5min, 200 VUs
```

## Results

Artifacts saved to `artifacts/`:

- `affected-orders.json` - Orders affected by resilience patterns
- `test-summary.txt` - Human-readable report
- `test-summary.json` - Full metrics
