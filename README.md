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
- **auth-service** - Authentication
- **order-service** - Order management
- **inventory-service** - Stock management
- **payment-service** - Payment processing
- **notification-service** - Email/SMS
- **analytics-service** - Metrics

## Commands

```bash
bun run build      # Build all
bun run dev        # Dev mode
bun run lint       # Lint
bun run test       # Test
```

See [MODULAR_SERVICES.md](MODULAR_SERVICES.md) for architecture details.
