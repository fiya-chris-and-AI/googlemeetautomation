# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/

# Install dependencies
RUN npm install

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/worker/ ./apps/worker/

# Build shared types first, then worker
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/worker

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/worker/package.json ./apps/worker/

# Install production dependencies only
RUN npm install --omit=dev

COPY --from=builder /app/packages/shared/dist/ ./packages/shared/dist/
COPY --from=builder /app/apps/worker/dist/ ./apps/worker/dist/

ENV NODE_ENV=production
ENV WORKER_PORT=8080

EXPOSE 8080

CMD ["node", "apps/worker/dist/index.js"]
