# E-Commerce Microservices

Event-driven microservices with Bun, TypeScript, and RabbitMQ.

## Quick Start

```bash
# Install
bun install

# Start infrastructure
docker-compose -f docker-compose.infra.yml up -d

# Dev mode
bun run dev
```

## Services

- **gateway** - API gateway (port 3000)
- **auth-service** - Authentication (port 9000)
- **order-service** - Order management (port 3001)
- **inventory-service** - Stock management (port 3002)
- **payment-service** - Payment processing (port 3004)
- **notification-service** - Email/SMS (port 3006)
- **analytics-service** - Metrics (port 3005)

## Commands

```bash
bun run build      # Build all
bun run dev        # Dev mode
bun run lint       # Lint
bun run test       # Test
```

See [MODULAR_SERVICES.md](MODULAR_SERVICES.md) for architecture details.
