FROM node:24-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile --prod=false

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Non-root user for security
RUN addgroup -S relay && adduser -S relay -G relay
USER relay

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3100/api/health || exit 1

CMD ["node_modules/.bin/tsx", "src/index.ts"]
