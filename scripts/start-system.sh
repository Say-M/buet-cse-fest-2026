#!/bin/bash
# Production-grade system startup with health checks

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================="
echo "STARTING E-COMMERCE MICROSERVICES STACK"
echo "========================================="

# 1. Clean up previous runs
echo "Cleaning up previous containers..."
cd "$PROJECT_ROOT"
docker compose -f docker-compose.dev.yml down -v 2>/dev/null || true

# 2. Start infrastructure layer
echo ""
echo "Starting infrastructure (MongoDB, RabbitMQ, Observability)..."
docker compose -f docker-compose.dev.yml up -d mongo1 mongo2 mongo3 rabbitmq otel-collector prometheus loki jaeger grafana

# 3. Wait for infrastructure health
echo ""
echo "Waiting for MongoDB replica set (this may take up to 2 minutes)..."
timeout 120 bash -c 'until docker exec mongo1 mongosh --eval "rs.status()" --quiet 2>/dev/null | grep -q "\"ok\" : 1"; do 
  echo -n "."
  sleep 3
done' && echo " ✓"

echo ""
echo "Waiting for RabbitMQ..."
timeout 60 bash -c 'until curl -s http://localhost:15672 > /dev/null 2>&1; do 
  echo -n "."
  sleep 2
done' && echo " ✓"

# 4. Start application services
echo ""
echo "Starting application services..."
docker compose -f docker-compose.dev.yml up -d gateway order-service inventory-service auth-service notification-service payment-service analytics-service

# 5. Wait for services to be ready
echo ""
echo "Waiting for services to initialize..."
sleep 15

# Health check function
check_health() {
    local service=$1
    local url=$2
    local max_attempts=30
    local attempt=0
    
    echo -n "Checking $service health"
    while [ $attempt -lt $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            echo " ✓"
            return 0
        fi
        echo -n "."
        attempt=$((attempt + 1))
        sleep 2
    done
    
    echo " ✗ FAILED"
    return 1
}

check_health "Gateway" "http://localhost:3000/health"
check_health "Order Service" "http://localhost:3001/health/live"
check_health "Inventory Service" "http://localhost:3002/health/live"
check_health "Auth Service" "http://localhost:9000/health/live"
check_health "Notification Service" "http://localhost:3006/health/live"
check_health "Payment Service" "http://localhost:3004/health/live"
check_health "Analytics Service" "http://localhost:3005/health/live"

# 6. Seed inventory data
echo ""
echo "Seeding inventory data..."
curl -X POST http://localhost:3002/inventory \
  -H "Content-Type: application/json" \
  -d '{"productId":"PROD-001","productName":"Gaming Console","quantity":1000}' \
  -s > /dev/null && echo "  ✓ PROD-001: Gaming Console (1000 units)"

curl -X POST http://localhost:3002/inventory \
  -H "Content-Type: application/json" \
  -d '{"productId":"PROD-002","productName":"Wireless Controller","quantity":2000}' \
  -s > /dev/null && echo "  ✓ PROD-002: Wireless Controller (2000 units)"

curl -X POST http://localhost:3002/inventory \
  -H "Content-Type: application/json" \
  -d '{"productId":"PROD-003","productName":"Gaming Headset","quantity":1500}' \
  -s > /dev/null && echo "  ✓ PROD-003: Gaming Headset (1500 units)"

curl -X POST http://localhost:3002/inventory \
  -H "Content-Type: application/json" \
  -d '{"productId":"PROD-004","productName":"Gaming Mouse","quantity":3000}' \
  -s > /dev/null && echo "  ✓ PROD-004: Gaming Mouse (3000 units)"

curl -X POST http://localhost:3002/inventory \
  -H "Content-Type: application/json" \
  -d '{"productId":"PROD-005","productName":"Mechanical Keyboard","quantity":2500}' \
  -s > /dev/null && echo "  ✓ PROD-005: Mechanical Keyboard (2500 units)"

echo ""
echo "========================================="
echo "SYSTEM READY FOR LOAD TESTING"
echo "========================================="
echo ""
echo "Service URLs:"
echo "  Gateway:         http://localhost:3000"
echo "  Order API:       http://localhost:3001"
echo "  Inventory:       http://localhost:3002"
echo "  Auth:            http://localhost:9000"
echo "  Notifications:   http://localhost:3006"
echo "  Payments:        http://localhost:3004"
echo "  Analytics:       http://localhost:3005"
echo ""
echo "Observability:"
echo "  Prometheus:   http://localhost:9090"
echo "  Grafana:      http://localhost:3003"
echo "  Jaeger:       http://localhost:16686"
echo "  RabbitMQ:     http://localhost:15672"
echo ""
echo "========================================="
