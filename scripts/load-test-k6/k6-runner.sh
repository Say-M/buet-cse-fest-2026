#!/bin/bash
# K6 Test Runner with Artifact Collection
# @format

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Create artifacts directory
mkdir -p "$SCRIPT_DIR/artifacts"

# Colors for better output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}K6 LOAD TEST RUNNER${NC}"
echo -e "${BLUE}=========================================${NC}"

# Parse arguments
SCENARIO=${1:-resilience}
BASE_URL=${BASE_URL:-http://localhost:3000}

echo -e "Scenario: ${GREEN}$SCENARIO${NC}"
echo -e "Base URL: $BASE_URL"
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}Error: k6 is not installed${NC}"
    echo ""
    echo "Install k6:"
    echo "  macOS:     brew install k6"
    echo "  Windows:   choco install k6"
    echo "  Linux:     See https://k6.io/docs/get-started/installation/"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓${NC} k6 is installed ($(k6 version))"

# Check if system is running
echo -e "\nChecking if system is running..."
if ! curl -s -f "$BASE_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}✗ Error: System is not running${NC}"
    echo ""
    echo "Start the system first:"
    echo -e "  ${YELLOW}bash scripts/start-system.sh${NC}"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓${NC} System is running"

# Verify scenario file exists
SCENARIO_FILE="$SCRIPT_DIR/scenarios/${SCENARIO}.js"
if [ ! -f "$SCENARIO_FILE" ]; then
    echo -e "${RED}✗ Error: Scenario file not found: $SCENARIO_FILE${NC}"
    echo ""
    echo "Available scenarios:"
    ls "$SCRIPT_DIR/scenarios/" | grep '\.js$' | sed 's/\.js$//' | sed 's/^/  - /'
    echo ""
    exit 1
fi

echo -e "${GREEN}✓${NC} Scenario file found: $SCENARIO.js"
echo ""

# Run k6 test
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}RUNNING K6 LOAD TEST${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

k6 run \
  --out json="$SCRIPT_DIR/artifacts/test-results-raw.json" \
  -e BASE_URL="$BASE_URL" \
  "$SCENARIO_FILE"

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${GREEN}✓ TEST COMPLETE${NC}"
    echo -e "${BLUE}=========================================${NC}"
else
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${YELLOW}⚠ TEST COMPLETED WITH WARNINGS${NC}"
    echo -e "${BLUE}=========================================${NC}"
fi

echo ""
echo "Artifacts saved to:"
echo "  📄 Test Summary:      $SCRIPT_DIR/artifacts/test-summary.txt"
echo "  📊 Full Metrics:      $SCRIPT_DIR/artifacts/test-summary.json"
echo "  🎯 Affected Orders:   $SCRIPT_DIR/artifacts/affected-orders.json"
echo "  📝 Raw Results:       $SCRIPT_DIR/artifacts/test-results-raw.json"
echo ""

# Check if jq is available for pretty printing
if command -v jq &> /dev/null; then
    echo -e "${BLUE}Quick Summary:${NC}"
    echo ""
    cat "$SCRIPT_DIR/artifacts/affected-orders.json" | jq -r '
      "Total Affected Orders: \(.summary.total)",
      "  - Gremlin Delays: \(.summary.byCategory.gremlin_delays)",
      "  - Circuit Breaker: \(.summary.byCategory.circuit_breaker_hits)",
      "  - Schrödinger: \(.summary.byCategory.schrodinger_crashes)",
      "  - Timeouts: \(.summary.byCategory.timeouts)",
      "  - Errors: \(.summary.byCategory.errors)"
    '
    echo ""
fi

echo "View detailed report:"
echo -e "  ${YELLOW}cat $SCRIPT_DIR/artifacts/test-summary.txt${NC}"
echo ""

exit $EXIT_CODE
