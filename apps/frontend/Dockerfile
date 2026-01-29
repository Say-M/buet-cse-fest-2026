# Use Bun as base image
FROM oven/bun:1 AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy workspace root package files
COPY package.json bun.lock ./

# Copy all workspace package.json files for dependency resolution
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/copy/package.json ./packages/copy/
COPY packages/common/package.json ./packages/common/
COPY packages/rabbitmq/package.json ./packages/rabbitmq/
COPY packages/telemetry/package.json ./packages/telemetry/
COPY packages/backup/package.json ./packages/backup/

# Copy frontend app package.json
COPY apps/frontend/package.json ./apps/frontend/

# Install dependencies
RUN bun install

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy workspace packages source (needed for @repo/* imports)
COPY packages ./packages

# Copy frontend app
COPY apps/frontend ./apps/frontend

# Set environment variables for build
ENV OUTPUT_TRACING_ROOT=/app
# Add your build-time environment variables here
# ENV NEXT_PUBLIC_API_URL=https://your-api.com

# Build the Next.js application directly (not using turbo for Docker builds)
WORKDIR /app/apps/frontend

# Create symlink to node_modules at workspace root so Next.js can find dependencies
RUN ln -s /app/node_modules ./node_modules

# Build with bun
RUN bun --bun next build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Create a non-root user (Debian syntax)
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nextjs

# Copy necessary files from builder
COPY --from=builder /app/apps/frontend/public ./public

# Set correct permissions for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 5000

# Set port environment variable
ENV PORT=5000
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["bun", "server.js"]

