import { spawn, spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { AddressInfo, createConnection, createServer, Server } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { splitSqlStatements } from '../sql-tokenizer.mjs';

const MIGRATE_SCRIPT = join(__dirname, '../migrate.mjs');

function runMigrate(databaseUrl: string, cwd?: string) {
  return spawnSync('node', [MIGRATE_SCRIPT], {
    cwd,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf-8',
  });
}

// spawnSync would block this process's event loop, and the retry test needs it
// free to serve the relay the migration script connects through.
function runMigrateAsync(databaseUrl: string) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn('node', [MIGRATE_SCRIPT], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function scratchDatabase(name: string) {
  const state = { admin: null as unknown as PrismaClient, url: '' };

  // FORCE so teardown never blocks on a lingering backend from a spawned run.
  const drop = () => state.admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);

  const create = async (extraSetup?: string) => {
    const base = new URL(process.env.TEST_DATABASE_URL as string);
    state.admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.href }) });
    await drop();
    await state.admin.$executeRawUnsafe(`CREATE DATABASE ${name}`);
    if (extraSetup) await state.admin.$executeRawUnsafe(extraSetup);

    base.pathname = `/${name}`;
    state.url = base.href;
  };

  const destroy = async () => {
    await drop();
    await state.admin.$disconnect();
  };

  return { create, destroy, url: () => state.url };
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

describe('migrate.mjs — connections with no usable search_path', () => {
  const scratch = scratchDatabase('annie_migrate_search_path_test');

  // A database-level default is the closest local stand-in for the pooler
  // handing back a session with nothing usable in search_path (#1118).
  beforeAll(
    () => scratch.create(`ALTER DATABASE annie_migrate_search_path_test SET search_path TO ''`),
    60_000
  );

  afterAll(() => scratch.destroy(), 60_000);

  it('migrates a fresh database and then restarts cleanly', () => {
    const fresh = runMigrate(scratch.url());

    expect(fresh.stderr).not.toContain('no schema has been selected');
    expect(fresh.status).toBe(0);
    expect(fresh.stdout).toMatch(/Applied \d+ migration\(s\)\./);

    // A URL-level `options` outranks the script's own startup option, so the
    // restart really does arrive on a connection with an empty search_path.
    const restart = runMigrate(`${scratch.url()}?options=-c%20search_path%3D`);

    expect(restart.stderr).not.toContain('no schema has been selected');
    expect(restart.status).toBe(0);
    expect(restart.stdout).toContain('Migrations up to date.');
  }, 60_000);
});

describe('migrate.mjs — recovers from a transient connection fault', () => {
  const scratch = scratchDatabase('annie_migrate_retry_test');
  let relay: Server;
  let relayUrl: string;

  beforeAll(async () => {
    await scratch.create();

    const target = new URL(scratch.url());
    let refusedFirst = false;
    relay = createServer((socket) => {
      if (!refusedFirst) {
        refusedFirst = true;
        socket.destroy();
        return;
      }
      const upstream = createConnection(Number(target.port || 5432), target.hostname);
      socket.pipe(upstream).pipe(socket);
      socket.on('error', () => upstream.destroy());
      upstream.on('error', () => socket.destroy());
    });
    await new Promise<void>((resolve) => relay.listen(0, '127.0.0.1', resolve));

    const relayed = new URL(scratch.url());
    relayed.hostname = '127.0.0.1';
    relayed.port = String((relay.address() as AddressInfo).port);
    relayUrl = relayed.href;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => relay.close(() => resolve()));
    await scratch.destroy();
  }, 60_000);

  it('migrates anyway after a first attempt loses its connection', async () => {
    const result = await runMigrateAsync(relayUrl);

    expect(result.stderr).toContain('Migration attempt 1/3 failed');
    expect(result.stderr).not.toContain('Migration failed after 3 attempts');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Applied \d+ migration\(s\)\./);
  }, 60_000);
});

describe('migrate.mjs — a migration that fails partway through', () => {
  const scratch = scratchDatabase('annie_migrate_partial_test');
  let workDir: string;

  beforeAll(async () => {
    await scratch.create();

    // migrate.mjs reads prisma/migrations relative to the working directory,
    // so a throwaway one keeps this scenario out of the real migration set.
    workDir = mkdtempSync(join(tmpdir(), 'annie-migrate-'));
    const migrationDir = join(workDir, 'prisma', 'migrations', '00000000000000_partial');
    mkdirSync(migrationDir, { recursive: true });
    writeFileSync(
      join(migrationDir, 'migration.sql'),
      'CREATE TABLE first_step (id INT);\nCREATE TABLE second_step (id INT) INVALID SYNTAX;\n'
    );
  }, 60_000);

  afterAll(async () => {
    rmSync(workDir, { recursive: true, force: true });
    await scratch.destroy();
  }, 60_000);

  it('aborts rather than replaying statements that already committed', async () => {
    const result = runMigrate(scratch.url(), workDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('partially applied, not safe to retry');
    expect(result.stderr).not.toContain('Migration attempt 2/3 failed');
    expect(result.stdout.match(/apply 00000000000000_partial/g)).toHaveLength(1);

    const check = new PrismaClient({
      adapter: new PrismaPg({ connectionString: scratch.url() }),
    });
    try {
      const [{ committed }] = await check.$queryRawUnsafe<{ committed: boolean }[]>(
        `SELECT to_regclass('public.first_step') IS NOT NULL AS committed`
      );
      expect(committed).toBe(true);
    } finally {
      await check.$disconnect();
    }
  }, 60_000);
});
