FROM oven/bun:1.1.38-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy workspace configuration
COPY package.json bun.lock ./
COPY packages/rabbitmq/package.json ./packages/rabbitmq/
COPY packages/telemetry/package.json ./packages/telemetry/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY apps/backend/payment-service/package.json ./apps/backend/payment-service/

# Install dependencies
RUN bun install

# Build stage
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Copy source files
COPY packages/rabbitmq ./packages/rabbitmq
COPY packages/telemetry ./packages/telemetry
COPY packages/typescript-config ./packages/typescript-config
COPY packages/eslint-config ./packages/eslint-config
COPY apps/backend/payment-service ./apps/backend/payment-service

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono
USER hono

# Copy built application
COPY --from=builder --chown=hono:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=hono:nodejs /app/packages ./packages
COPY --from=builder --chown=hono:nodejs /app/apps/backend/payment-service ./apps/backend/payment-service

WORKDIR /app/apps/backend/payment-service

EXPOSE 3004

CMD ["bun", "run", "src/index.ts"]
