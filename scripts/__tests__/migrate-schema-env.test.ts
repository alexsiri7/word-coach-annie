import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

// Companion to migrate-schema-resolution.test.ts with DATABASE_SCHEMA set.
// migrate.mjs runs on import, so each schema setting needs its own test file.
const migrateMocks = vi.hoisted(() => {
  const executed: string[] = [];
  const queried: string[] = [];
  const transactions: string[][] = [];
  const applied: { migration_name: string }[] = [];
  const client = {
    $executeRawUnsafe: (sql: string) => {
      executed.push(sql);
      return Promise.resolve(0);
    },
    $queryRawUnsafe: (sql: string) => {
      if (!sql.includes('_prisma_migrations')) return Promise.resolve([{ count: 0 }]);
      queried.push(sql);
      return Promise.resolve(applied);
    },
    $transaction: (fn: (tx: unknown) => Promise<void>) => {
      const statements: string[] = [];
      transactions.push(statements);
      return fn({
        $executeRawUnsafe: (sql: string) => {
          statements.push(sql);
          return Promise.resolve(0);
        },
      });
    },
    $disconnect: () => Promise.resolve(),
  };
  return { executed, queried, transactions, applied, client };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return migrateMocks.client;
    }
  },
}));
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));

describe('migrate.mjs — DATABASE_SCHEMA', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalSchema = process.env.DATABASE_SCHEMA;

  afterAll(() => {
    if (originalSchema === undefined) {
      delete process.env.DATABASE_SCHEMA;
    } else {
      process.env.DATABASE_SCHEMA = originalSchema;
    }
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('qualifies bookkeeping with, and scopes migrations to, the configured schema', async () => {
    const migrationsDir = join(__dirname, '../../prisma/migrations');
    const migrationDirs = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(migrationsDir, d.name, 'migration.sql')))
      .map((d) => d.name)
      .sort();
    // Leave one migration unapplied so the apply + record path runs too.
    migrateMocks.applied.push(
      ...migrationDirs.slice(0, -1).map((migration_name) => ({ migration_name }))
    );
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/unused';
    process.env.DATABASE_SCHEMA = 'annie';

    // Top-level await in migrate.mjs means the import resolves once the run finished.
    await import('../migrate.mjs');

    expect(migrateMocks.executed[0]).toContain('CREATE TABLE IF NOT EXISTS "annie"."_prisma_migrations"');
    expect(migrateMocks.queried[0]).toContain('FROM "annie"."_prisma_migrations"');
    expect(migrateMocks.transactions).toHaveLength(1);
    for (const statements of migrateMocks.transactions) {
      expect(statements[0]).toBe('SET LOCAL search_path TO "annie", extensions');
      expect(statements.at(-1)).toContain('INSERT INTO "annie"."_prisma_migrations"');
      // The migration body runs between the SET LOCAL and the bookkeeping INSERT.
      expect(statements.length).toBeGreaterThan(2);
    }

    // Closure check: no statement anywhere reaches _prisma_migrations unqualified.
    const unqualified = [...migrateMocks.executed, ...migrateMocks.queried, ...migrateMocks.transactions.flat()]
      .map((sql) =>
        sql
          .replaceAll('"annie"."_prisma_migrations"', '')
          .replaceAll('"_prisma_migrations_pkey"', '')
      )
      .filter((sql) => sql.includes('_prisma_migrations'));
    expect(unqualified).toEqual([]);
  });
});
