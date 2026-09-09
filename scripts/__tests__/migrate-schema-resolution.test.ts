import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

// Kept apart from migrate.test.ts: that file drives the real runner against a
// scratch database, and a module-level PrismaClient mock would hijack it.
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
    $queryRaw: (strings: TemplateStringsArray) => {
      queried.push(strings.join(''));
      return Promise.resolve(applied);
    },
    $queryRawUnsafe: () => Promise.resolve([{ count: 0 }]),
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

describe('migrate.mjs — schema resolution', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterAll(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('pins each migration to one connection and schema-qualifies every _prisma_migrations statement', async () => {
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

    // Top-level await in migrate.mjs means the import resolves once the run finished.
    await import('../migrate.mjs');

    expect(migrateMocks.executed[0]).toContain('CREATE TABLE IF NOT EXISTS public."_prisma_migrations"');
    expect(migrateMocks.queried[0]).toContain('FROM public."_prisma_migrations"');
    expect(migrateMocks.transactions).toHaveLength(1);
    for (const statements of migrateMocks.transactions) {
      expect(statements[0]).toBe('SET LOCAL search_path TO public, extensions');
      expect(statements.at(-1)).toContain('INSERT INTO public."_prisma_migrations"');
      // The migration body runs between the SET LOCAL and the bookkeeping INSERT.
      expect(statements.length).toBeGreaterThan(2);
    }

    // Closure check: no statement anywhere reaches _prisma_migrations unqualified.
    const unqualified = [...migrateMocks.executed, ...migrateMocks.queried, ...migrateMocks.transactions.flat()]
      .map((sql) =>
        sql
          .replaceAll('public."_prisma_migrations"', '')
          .replaceAll('"_prisma_migrations_pkey"', '')
      )
      .filter((sql) => sql.includes('_prisma_migrations'));
    expect(unqualified).toEqual([]);
  });
});
