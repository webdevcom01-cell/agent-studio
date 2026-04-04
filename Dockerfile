# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --no-frozen-lockfile

# ── Stage 2: Build the application ───────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Cache bust: change this value to force Docker to re-run pnpm build
ARG CACHE_BUST=3
RUN pnpm build

# ── Stage 3: Database migration runner ───────────────────────────────────────
# Runs `prisma migrate deploy` once at startup, then exits (restart: no).
FROM node:20-alpine AS migrate

RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY package.json pnpm-lock.yaml .npmrc ./

ENV NODE_ENV=production

CMD ["npx", "prisma", "migrate", "deploy"]

# ── Stage 4: BullMQ worker ────────────────────────────────────────────────────
# Processes flow.execute, eval.run, and webhook.retry jobs from Redis queue.
# Requires REDIS_URL and DATABASE_URL environment variables.
FROM node:20-alpine AS worker

RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Use the full deps (includes devDeps for tsx TypeScript execution)
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Regenerate Prisma client for the correct binary target
RUN pnpm db:generate

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-8080}/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npx", "tsx", "src/lib/queue/worker.ts"]

# ── Stage 5: Production runner (LAST — Railway builds this stage) ─────────────
FROM node:20-alpine AS runner

# Install LSP server binaries for the lsp_query node (Phase F1)
# typescript-language-server handles TypeScript + JavaScript
# pyright-langserver (via pyright) handles Python
RUN apk add --no-cache curl python3 && \
    npm install -g typescript typescript-language-server pyright --no-fund --no-audit

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy Next.js standalone output — server.js lands at /app/server.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma engine binaries are bundled in standalone output
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

# tiktoken WASM binary (not traced by Next.js standalone)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tiktoken ./node_modules/tiktoken

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# server.js is at /app/server.js after COPY --from=builder /app/.next/standalone ./
CMD ["node", "server.js"]
