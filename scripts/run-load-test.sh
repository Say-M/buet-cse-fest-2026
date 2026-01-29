#!/bin/bash
# Complete Load Test Workflow
# Orchestrates system startup, test execution, and report generation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Parse arguments
SCENARIO=${1:-resilience}
SKIP_STARTUP=${SKIP_STARTUP:-false}

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}COMPLETE LOAD TEST WORKFLOW${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Step 1: Start system (unless skipped)
if [ "$SKIP_STARTUP" != "true" ]; then
    echo -e "${YELLOW}Step 1: Starting system...${NC}"
    echo ""
    bash "$SCRIPT_DIR/start-system.sh"
    
    # Wait for system stabilization
    echo ""
    echo -e "${YELLOW}Waiting 30 seconds for system stabilization...${NC}"
    for i in {1..30}; do
        echo -n "."
        sleep 1
    done
    echo " Done"
else
    echo -e "${YELLOW}Skipping system startup (SKIP_STARTUP=true)${NC}"
fi

# Step 2: Run load tests
echo ""
echo -e "${YELLOW}Step 2: Running k6 load tests (scenario: $SCENARIO)...${NC}"
echo ""

cd "$SCRIPT_DIR/load-test-k6"
bash k6-runner.sh "$SCENARIO"

TEST_EXIT_CODE=$?

# Step 3: Generate consolidated report
echo ""
echo -e "${YELLOW}Step 3: Generating consolidated analysis...${NC}"
echo ""

ARTIFACTS_DIR="$SCRIPT_DIR/load-test-k6/artifacts"

if [ -f "$ARTIFACTS_DIR/test-summary.txt" ]; then
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}FULL TEST REPORT${NC}"
    echo -e "${BLUE}=========================================${NC}"
    cat "$ARTIFACTS_DIR/test-summary.txt"
fi

echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${GREEN}LOAD TEST WORKFLOW COMPLETE${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

echo "Generated Artifacts:"
if [ -f "$ARTIFACTS_DIR/affected-orders.json" ]; then
    AFFECTED_COUNT=$(cat "$ARTIFACTS_DIR/affected-orders.json" | grep -o '"total":[[:space:]]*[0-9]*' | grep -o '[0-9]*' || echo "0")
    echo -e "  ${GREEN}✓${NC} affected-orders.json (${AFFECTED_COUNT} orders)"
fi
if [ -f "$ARTIFACTS_DIR/test-summary.json" ]; then
    echo -e "  ${GREEN}✓${NC} test-summary.json"
fi
if [ -f "$ARTIFACTS_DIR/test-summary.txt" ]; then
    echo -e "  ${GREEN}✓${NC} test-summary.txt"
fi
if [ -f "$ARTIFACTS_DIR/test-results-raw.json" ]; then
    echo -e "  ${GREEN}✓${NC} test-results-raw.json"
fi

echo ""
echo "Next Steps:"
echo -e "  View summary:        ${YELLOW}cat $ARTIFACTS_DIR/test-summary.txt${NC}"
echo -e "  View affected orders: ${YELLOW}cat $ARTIFACTS_DIR/affected-orders.json | jq '.summary'${NC}"
echo -e "  View full metrics:    ${YELLOW}cat $ARTIFACTS_DIR/test-summary.json | jq${NC}"
echo ""
echo "Observability Dashboards:"
echo "  Grafana:     http://localhost:3003"
echo "  Prometheus:  http://localhost:9090"
echo "  Jaeger:      http://localhost:16686"
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ Some tests had warnings (check thresholds)${NC}"
    exit $TEST_EXIT_CODE
fi
