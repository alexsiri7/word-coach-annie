#!/bin/sh
set -e

echo "Generating Prisma Client..."
npx prisma generate

# NEVER use 'prisma db push' here — it can drop and recreate tables,
# wiping all data. Use migrations for schema changes instead.

echo "Starting application..."
npm run dev
