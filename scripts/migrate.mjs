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
import { readFileSync, readdirSync, existsSync } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { join } from 'path';

// Use DATABASE_URL (pooler) — our script splits SQL into single statements
// which work fine through PgBouncer transaction mode.
// Guard: PrismaPg accepts undefined without throwing, which would cause
// migrations to silently no-op on Railway when the env var is missing.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn('Warning: DATABASE_URL is not set — skipping migrations. Server will start but DB-dependent routes will fail.');
  process.exit(0);
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    // Dollar-quote: $tag$ ... $tag$
    if (sql[i] === '$') {
      const tagEnd = sql.indexOf('$', i + 1);
      if (tagEnd !== -1) {
        const tag = sql.slice(i, tagEnd + 1);
        const closeIdx = sql.indexOf(tag, tagEnd + 1);
        if (closeIdx !== -1) {
          current += sql.slice(i, closeIdx + tag.length);
          i = closeIdx + tag.length;
          continue;
        }
      }
    }
    // Single-quoted string
    if (sql[i] === "'") {
      current += sql[i++];
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { current += "''"; i += 2; }
        else if (sql[i] === "'") { current += sql[i++]; break; }
        else current += sql[i++];
      }
      continue;
    }
    // Single-line comment (strip)
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    // Block comment (strip)
    if (sql[i] === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // Statement separator
    if (sql[i] === ';') {
      const stmt = current.trim();
      if (stmt.length > 0) statements.push(stmt);
      current = '';
      i++;
      continue;
    }
    current += sql[i++];
  }
  const stmt = current.trim();
  if (stmt.length > 0) statements.push(stmt);
  return statements;
}

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

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
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

migrate().catch(async (e) => {
  console.error('Migration failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
