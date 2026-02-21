#!/bin/sh
set -e

echo "Generating Prisma Client..."
npx prisma generate

echo "Pushing schema to database..."
npx prisma db push

echo "Starting application..."
npm run dev
