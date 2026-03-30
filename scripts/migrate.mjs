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
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { join } from 'path';

// Use DATABASE_URL (pooler) — our script splits SQL into single statements
// which work fine through PgBouncer transaction mode
const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

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

/**
 * Trigger a Supabase backup via the Management API before applying migrations.
 * Requires SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF env vars.
 * Falls back to a local JSON dump if the API isn't configured.
 */
async function backupBeforeMigrate() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;

  if (token && projectRef) {
    console.log('  backup: triggering Supabase backup...');
    try {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/backups`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (res.ok) {
        console.log('  backup: Supabase backup triggered successfully');
        return;
      }
      console.warn(`  backup: Supabase API returned ${res.status} — falling back to local dump`);
    } catch (e) {
      console.warn(`  backup: Supabase API call failed (${e.message}) — falling back to local dump`);
    }
  }

  // Fallback: dump all tables to a JSON file in the container
  const tables = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'`
  );

  const backup = {};
  let totalRows = 0;

  for (const { tablename } of tables) {
    try {
      const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${tablename}"`);
      backup[tablename] = rows;
      totalRows += rows.length;
    } catch (e) {
      backup[tablename] = { error: e.message };
    }
  }

  if (totalRows === 0) {
    console.log('  backup: skipped (database is empty)');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(process.cwd(), 'backups');
  try { mkdirSync(backupDir, { recursive: true }); } catch {}
  const backupPath = join(backupDir, `pre-migrate-${timestamp}.json`);

  writeFileSync(backupPath, JSON.stringify(backup, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ));
  console.log(`  backup: ${totalRows} rows across ${tables.length} tables → ${backupPath} (local fallback)`);
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

  // Check if there are pending migrations
  const pending = dirs.filter((d) => !appliedNames.has(d) && existsSync(join(migrationsDir, d, 'migration.sql')));

  // Backup before applying any new migrations
  if (pending.length > 0) {
    console.log(`  ${pending.length} pending migration(s) — backing up first...`);
    await backupBeforeMigrate();
  }

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
