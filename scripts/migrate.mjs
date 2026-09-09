/**
 * Lightweight migration runner for Railway deploys.
 *
 * Uses only @prisma/client (available in standalone output) instead of
 * the full prisma CLI which requires the entire dependency tree.
 *
 * Reads Prisma-format migration directories from prisma/migrations/
 * and applies any that haven't been recorded in _prisma_migrations.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { join } from 'path';
import { splitSqlStatements } from './sql-tokenizer.mjs';

// Use DATABASE_URL (pooler) — our script splits SQL into single statements
// which work fine through PgBouncer transaction mode.
// Guard: PrismaPg accepts undefined without throwing, which would cause
// migrations to silently no-op on Railway when the env var is missing.
// Check before importing DB packages so the guard works even without node_modules.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn('Warning: DATABASE_URL is not set — skipping migrations. Server will start but DB-dependent routes will fail.');
  process.exit(0);
}

let PrismaClient, PrismaPg;
try {
  ({ PrismaClient } = await import('@prisma/client'));
  ({ PrismaPg } = await import('@prisma/adapter-pg'));
} catch (e) {
  console.error('Migration failed: could not load Prisma packages:', e);
  process.exit(1);
}

async function ensureMigrationsTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."_prisma_migrations" (
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

async function migrate(prisma) {
  await ensureMigrationsTable(prisma);

  // Get applied migrations
  const applied = await prisma.$queryRaw`SELECT migration_name FROM public."_prisma_migrations" WHERE rolled_back_at IS NULL`;
  const appliedNames = new Set(applied.map((r) => r.migration_name));

  // Get migration directories (sorted)
  const migrationsDir = join(process.cwd(), 'prisma', 'migrations');
  if (!existsSync(migrationsDir)) {
    console.log('No prisma/migrations directory found, skipping.');
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
      console.warn(`  warn  ${dir} — no migration.sql found, skipping`);
      continue;
    }

    const sql = readFileSync(sqlPath, 'utf-8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    // Safety check: refuse to run migrations that contain destructive DDL
    // if the database already has data. This prevents accidental data loss
    // from re-applying the init migration against a populated database.
    const destructivePatterns = /\b(DROP\s+TABLE|TRUNCATE|DROP\s+SCHEMA)\b/i;
    if (destructivePatterns.test(sql)) {
      const [{ count }] = await prisma.$queryRawUnsafe(
        `SELECT COALESCE(SUM(n_tup_ins - n_tup_del), 0)::bigint AS count FROM pg_stat_user_tables WHERE schemaname = 'public'`
      );
      if (count > 0) {
        console.error(`  ABORT ${dir} — contains destructive DDL (DROP/TRUNCATE) and database has ${count} live rows`);
        console.error(`  Refusing to run. If this is intentional, apply manually.`);
        process.exit(1);
      }
    }

    console.log(`  apply ${dir}`);

    // Split into individual statements for Prisma's $executeRawUnsafe
    // which only supports single statements at a time.
    // Uses a context-aware tokenizer to handle dollar-quoted strings ($$...$$)
    // and single-quoted strings that may contain semicolons.
    const statements = splitSqlStatements(sql);

    for (const [i, stmt] of statements.entries()) {
      try {
        await prisma.$executeRawUnsafe(stmt);
      } catch (e) {
        console.error(`  FAIL  ${dir} — statement ${i + 1}/${statements.length}:`);
        console.error(`         ${stmt.slice(0, 200)}`);
        throw e;
      }
    }

    // Record in _prisma_migrations
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO public."_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count") VALUES ($1, $2, $3, NOW(), 1)`,
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
}

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

// A failure in this ~10s startup window crashes the container with no server,
// and nothing redeploys it automatically — so a transient connection fault
// must not be fatal on the first try. Each attempt builds its own client so a
// retry gets a fresh pooled connection rather than reusing the bad session.
async function runMigrations() {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    let failure = null;
    try {
      await migrate(prisma);
    } catch (e) {
      failure = e;
    } finally {
      await prisma.$disconnect().catch(() => {});
    }

    if (!failure) return;

    console.error(`Migration attempt ${attempt}/${ATTEMPTS} failed:`, failure);

    if (attempt === ATTEMPTS) {
      console.error(`Migration failed after ${ATTEMPTS} attempts.`);
      process.exit(1);
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
}

await runMigrations();
