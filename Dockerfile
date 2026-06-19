# --- Stage 1: Install dependencies ---
# Pinned to multi-arch manifest list digest for node:20-slim (2025-05-16).
# To update: docker manifest inspect node:20-slim --verbose | jq '.[0].Descriptor.digest'
FROM node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS deps

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# --- Stage 2: Build the application ---
FROM node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS builder

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ARG RAILWAY_GIT_COMMIT_SHA=""

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV RAILWAY_GIT_COMMIT_SHA=${RAILWAY_GIT_COMMIT_SHA}
RUN npx prisma generate
RUN npm run build

# --- Stage 3: Production runtime ---
FROM node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS runner

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
# Cap V8 old-space at 380 MB. Node.js total RSS also includes young-gen, native bindings
# (Prisma, OpenSSL, libuv), and OS overhead (~19–30 MB observed in production). Setting
# old-space to ~74% of container RAM keeps total RSS at ~78%, safely below the 80%
# alert threshold. Adjust if Railway plan is upgraded (keep old-space ≤ 74% of container RAM).
ENV NODE_OPTIONS="--max-old-space-size=380"

# Next.js standalone output includes only what's needed
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/.skills ./.skills

# Migration runner + migration SQL files
COPY --from=builder /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder /app/scripts/sql-tokenizer.mjs ./scripts/sql-tokenizer.mjs
COPY --from=builder /app/prisma/migrations ./prisma/migrations

USER nextjs

EXPOSE 3000

CMD node scripts/migrate.mjs && node server.js
