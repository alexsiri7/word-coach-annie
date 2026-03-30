/**
 * Lightweight migration runner for Railway deploys.
 *
 * Uses only @prisma/client (available in standalone output) instead of
 * the full prisma CLI which requires the entire dependency tree.
 *
 * Reads Prisma-format migration directories from prisma/migrations/
 * and applies any that haven't been recorded in _prisma_migrations.
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { join } from 'path';

// Use DIRECT_DATABASE_URL for migrations (bypasses PgBouncer transaction mode
// which doesn't support multi-statement operations or advisory locks)
const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});

async function ensureMigrationsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
    )
  `);
}

async function migrate() {
  await ensureMigrationsTable();

  // Get applied migrations
  const applied = await prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL`;
  const appliedNames = new Set(applied.map((r) => r.migration_name));

  // Get migration directories (sorted)
  const migrationsDir = join(process.cwd(), 'prisma', 'migrations');
  if (!existsSync(migrationsDir)) {
    console.log('No prisma/migrations directory found, skipping.');
    await prisma.$disconnect();
    return;
  }

  const dirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let appliedCount = 0;

  for (const dir of dirs) {
    if (appliedNames.has(dir)) {
      console.log(`  skip  ${dir} (already applied)`);
      continue;
    }

    const sqlPath = join(migrationsDir, dir, 'migration.sql');
    if (!existsSync(sqlPath)) {
      continue;
    }

    const sql = readFileSync(sqlPath, 'utf-8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    console.log(`  apply ${dir}`);

    // Split into individual statements for Prisma's $executeRawUnsafe
    // which only supports single statements at a time
    const statements = sql
      .split(';')
      .map((s) => s.replace(/--[^\n]*/g, '').trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }

    // Record in _prisma_migrations
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count") VALUES ($1, $2, $3, NOW(), 1)`,
      id,
      checksum,
      dir
    );

    appliedCount++;
    console.log(`  done  ${dir}`);
  }

  if (appliedCount === 0) {
    console.log('Migrations up to date.');
  } else {
    console.log(`Applied ${appliedCount} migration(s).`);
  }

  await prisma.$disconnect();
}

migrate().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
