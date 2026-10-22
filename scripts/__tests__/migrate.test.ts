import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { splitSqlStatements } from '../sql-tokenizer.mjs';

const MIGRATE_SCRIPT = join(__dirname, '../migrate.mjs');

function runMigrate(databaseUrl: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return spawnSync('node', [MIGRATE_SCRIPT], {
    env: { ...process.env, DATABASE_URL: databaseUrl, ...extraEnv },
    encoding: 'utf-8',
  });
}

describe('splitSqlStatements()', () => {
  it('splits simple semicolon-separated statements', () => {
    const sql = 'CREATE TABLE a (id INT); CREATE TABLE b (id INT);';
    expect(splitSqlStatements(sql)).toEqual([
      'CREATE TABLE a (id INT)',
      'CREATE TABLE b (id INT)',
    ]);
  });

  it('does NOT split on semicolons inside dollar-quoted blocks', () => {
    const sql = `
      CREATE FUNCTION foo() RETURNS void AS $$
        BEGIN
          RAISE NOTICE 'hello; world';
        END;
      $$ LANGUAGE plpgsql;
    `;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain('$$');
  });

  it('does NOT split on semicolons inside single-quoted strings', () => {
    const sql = `INSERT INTO t (col) VALUES ('value;with;semis');`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain("'value;with;semis'");
  });

  it('handles escaped single quotes (repeated quote)', () => {
    const sql = `INSERT INTO t (col) VALUES ('it''s fine; really');`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
  });

  it('strips single-line comments', () => {
    const sql = `-- this is a comment\nCREATE TABLE a (id INT);`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).not.toContain('--');
  });

  it('strips block comments', () => {
    const sql = `/* drop everything */ CREATE TABLE a (id INT);`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).not.toContain('/*');
  });

  it('returns empty array for empty input', () => {
    expect(splitSqlStatements('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(splitSqlStatements('   \n\t  ')).toEqual([]);
  });

  it('handles trailing content with no closing semicolon', () => {
    const sql = 'SELECT 1;\nSELECT 2';
    expect(splitSqlStatements(sql)).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('handles $1 parameter placeholders without treating them as dollar-quotes', () => {
    // tagEnd === -1 when no second $ follows immediately after $1
    const sql = `SELECT $1; SELECT $2;`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
  });

  it('throws on unclosed block comment', () => {
    const sql = `CREATE TABLE a (id INT); /* unclosed comment`;
    expect(() => splitSqlStatements(sql)).toThrow('Unclosed block comment');
  });

  it('throws on unclosed single-quoted string', () => {
    const sql = `INSERT INTO t VALUES ('unclosed`;
    expect(() => splitSqlStatements(sql)).toThrow('Unclosed single-quoted string');
  });

  it('throws on unclosed dollar-quote tag', () => {
    const sql = `CREATE FUNCTION foo() RETURNS void AS $$ BEGIN -- missing close`;
    expect(() => splitSqlStatements(sql)).toThrow('Unclosed dollar-quote tag');
  });

  it('handles multiple statements with comments between them', () => {
    const sql = `
      CREATE TABLE a (id INT);
      -- a comment between statements
      CREATE TABLE b (id INT);
      /* block comment */ CREATE TABLE c (id INT);
    `;
    expect(splitSqlStatements(sql)).toHaveLength(3);
  });
});

describe('migrate.mjs — DATABASE_URL guard', () => {
  it('exits with code 0 and emits a warning when DATABASE_URL is not set', () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;

    const result = spawnSync('node', [join(__dirname, '../migrate.mjs')], {
      env,
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('DATABASE_URL is not set');
    expect(result.stderr).toContain('skipping migrations');
  });
});

describe('migrate.mjs — production TLS gate', () => {
  it('refuses to start in production before connecting to a plaintext database', () => {
    const result = spawnSync('node', [MIGRATE_SCRIPT], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:1/annie_test',
      },
      encoding: 'utf-8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Startup refused');
    expect(result.stderr).toContain('sslmode');
    expect(result.stderr).not.toContain('Migration attempt');
  });

  it('refuses a plaintext Redis URL even when DATABASE_URL is unset', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', REDIS_URL: 'redis://localhost:6379' };
    delete env.DATABASE_URL;
    const result = spawnSync('node', [MIGRATE_SCRIPT], { env, encoding: 'utf-8' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Startup refused');
    expect(result.stderr).toContain('rediss');
    expect(result.stderr).not.toContain('skipping migrations');
  });
});

describe('migrate.mjs — production auth gate', () => {
  function runWithoutAuth(overrides: NodeJS.ProcessEnv) {
    const env: NodeJS.ProcessEnv = { ...process.env, ...overrides };
    for (const key of ['DATABASE_URL', 'REDIS_URL', 'API_TOKEN', 'GOOGLE_CLIENT_ID']) {
      if (!(key in overrides)) delete env[key];
    }
    return spawnSync('node', [MIGRATE_SCRIPT], { env, encoding: 'utf-8' });
  }

  it('refuses to start in production when no auth is configured', () => {
    const result = runWithoutAuth({ NODE_ENV: 'production' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Startup refused');
    expect(result.stderr).toContain('API_TOKEN');
    expect(result.stderr).not.toContain('skipping migrations');
  });

  it.each([
    ['API_TOKEN', { API_TOKEN: 'tok' }],
    ['GOOGLE_CLIENT_ID', { GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com' }],
  ])('starts in production when %s is set', (_, auth) => {
    const result = runWithoutAuth({ NODE_ENV: 'production', ...auth });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('Startup refused');
  });

  it('starts outside production without auth (local dev mode)', () => {
    const result = runWithoutAuth({ NODE_ENV: 'development' });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('Startup refused');
  });
});

// The runner stage copies scripts one by one; a module migrate.mjs imports but
// the image lacks crashes the container before the server starts.
describe('Dockerfile ships every module migrate.mjs imports', () => {
  const dockerfile = readFileSync(join(__dirname, '../../Dockerfile'), 'utf-8');
  const imports = [...readFileSync(MIGRATE_SCRIPT, 'utf-8').matchAll(/from '\.\/([\w-]+\.mjs)'/g)].map(
    (m) => m[1],
  );

  it('finds the local imports', () => {
    expect(imports).toContain('transport-security.mjs');
    expect(imports).toContain('auth-configuration.mjs');
  });

  it.each(imports)('copies %s', (file) => {
    expect(dockerfile).toContain(`COPY --from=builder /app/scripts/${file}`);
  });
});

describe('migrate.mjs — transient connection failures', () => {
  it('retries before giving up, then exits non-zero', () => {
    // Port 1 refuses immediately, so each attempt fails the same way and fast.
    const result = runMigrate('postgresql://postgres:postgres@127.0.0.1:1/annie_test');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Migration attempt 1/3 failed');
    expect(result.stderr).toContain('Migration attempt 2/3 failed');
    expect(result.stderr).toContain('Migration attempt 3/3 failed');
    expect(result.stderr).toContain('Migration failed after 3 attempts');
  }, 60_000);
});

describe('migrate.mjs — migration bookkeeping ignores search_path', () => {
  const SCRATCH_DB = 'annie_migrate_search_path_test';
  let admin: PrismaClient;
  let scratchUrl: string;

  // FORCE so teardown never blocks on a lingering backend from a spawned run.
  const dropScratch = () =>
    admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);

  beforeAll(async () => {
    const base = new URL(process.env.TEST_DATABASE_URL as string);
    admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.href }) });
    await dropScratch();
    await admin.$executeRawUnsafe(`CREATE DATABASE ${SCRATCH_DB}`);

    base.pathname = `/${SCRATCH_DB}`;
    scratchUrl = base.href;
  }, 60_000);

  afterAll(async () => {
    await dropScratch();
    await admin.$disconnect();
  }, 60_000);

  it('restarts cleanly when the pooler hands back an empty search_path', () => {
    expect(runMigrate(scratchUrl).status).toBe(0);

    const emptySearchPath = `${scratchUrl}?options=-c%20search_path%3D`;
    const restart = runMigrate(emptySearchPath);

    expect(restart.stderr).not.toContain('no schema has been selected');
    expect(restart.status).toBe(0);
    expect(restart.stdout).toContain('Migrations up to date.');
  }, 60_000);

  it('adopts migrations recorded by the retired run-migrations.ts instead of replaying them', async () => {
    expect(runMigrate(scratchUrl).status).toBe(0);

    const scratch = new PrismaClient({ adapter: new PrismaPg({ connectionString: scratchUrl }) });
    try {
      await scratch.$executeRawUnsafe(
        `CREATE TABLE "_applied_migrations" ("name" TEXT NOT NULL PRIMARY KEY, "applied_at" TIMESTAMP NOT NULL DEFAULT NOW())`
      );
      await scratch.$executeRawUnsafe(
        `INSERT INTO "_applied_migrations" ("name") SELECT migration_name FROM "_prisma_migrations"`
      );
      await scratch.$executeRawUnsafe(`DROP TABLE "_prisma_migrations"`);

      const adopted = runMigrate(scratchUrl);

      expect(adopted.stderr).not.toContain('already exists');
      expect(adopted.status).toBe(0);
      expect(adopted.stdout).toContain('adopt 00000000000000_init');
      const [legacy, recorded] = await Promise.all([
        scratch.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "_applied_migrations"`),
        scratch.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "_prisma_migrations"`),
      ]);
      expect(recorded[0].n).toBe(legacy[0].n);

      expect(runMigrate(scratchUrl).stdout).toContain('Migrations up to date.');
    } finally {
      await scratch.$disconnect();
    }
  }, 60_000);
});

describe('migrate.mjs — first run as a role that only owns its schema', () => {
  // Database, role and schema share one name, as staging's annie_staging does.
  const NAME = 'annie_migrate_owned_schema_test';
  let admin: PrismaClient;
  let scratchAdmin: PrismaClient;
  let roleUrl: string;

  const dropScratch = () =>
    admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${NAME} WITH (FORCE)`);

  beforeAll(async () => {
    const base = new URL(process.env.TEST_DATABASE_URL as string);
    admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.href }) });
    await dropScratch();
    await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS ${NAME}`);
    await admin.$executeRawUnsafe(`CREATE ROLE ${NAME} LOGIN PASSWORD 'owned-schema-test'`);
    await admin.$executeRawUnsafe(`CREATE DATABASE ${NAME}`);

    base.pathname = `/${NAME}`;
    scratchAdmin = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.href }) });
    await scratchAdmin.$executeRawUnsafe(`CREATE SCHEMA ${NAME} AUTHORIZATION ${NAME}`);

    base.username = NAME;
    base.password = 'owned-schema-test';
    roleUrl = base.href;
  }, 60_000);

  afterAll(async () => {
    await scratchAdmin.$disconnect();
    await dropScratch();
    await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS ${NAME}`);
    await admin.$disconnect();
  }, 60_000);

  it('applies every migration into its own schema without database-level CREATE', async () => {
    const first = runMigrate(roleUrl, { DATABASE_SCHEMA: NAME });

    expect(first.stderr).not.toContain('permission denied');
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('apply 00000000000000_init');
    expect(runMigrate(roleUrl, { DATABASE_SCHEMA: NAME }).stdout).toContain('Migrations up to date.');

    const [owned, inPublic] = await Promise.all([
      scratchAdmin.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM pg_tables WHERE schemaname = $1 AND tableowner = $1`,
        NAME
      ),
      scratchAdmin.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'public' AND tableowner = $1`,
        NAME
      ),
    ]);
    expect(owned[0].n).toBeGreaterThan(0n);
    expect(inPublic[0].n).toBe(0n);
  }, 60_000);
});
