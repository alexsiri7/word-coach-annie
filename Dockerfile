# --- Stage 1: Install dependencies ---
FROM node:20-slim AS deps

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# --- Stage 2: Build the application ---
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ARG RAILWAY_GIT_COMMIT_SHA=""

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV RAILWAY_GIT_COMMIT_SHA=${RAILWAY_GIT_COMMIT_SHA}
RUN npx prisma generate
RUN npm run build

# --- Stage 3: Production runtime ---
FROM node:20-slim AS runner

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production

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
