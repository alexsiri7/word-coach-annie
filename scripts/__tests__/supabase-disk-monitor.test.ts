import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// The disk monitor must connect over TLS whatever sslmode its secret carries: the appended
// sslmode has to stay the last one, because libpq uses a repeated URI parameter's last
// value (#1585).
describe('supabase disk monitor', () => {
  const monitor = readFileSync(
    join(__dirname, '../../.github/workflows/supabase-disk-monitor.yml'),
    'utf-8',
  );
  const queryStep =
    monitor
      .match(/- name: Query disk usage\n[\s\S]*?\n {8}run: \|\n((?: {10}.*\n|\n)+)/)?.[1]
      .replace(/^ {10}/gm, '')
      .replace(/\$\{\{ matrix\.instance \}\}/g, 'Annie') ?? '';

  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'disk-monitor-'));
    writeFileSync(join(dir, 'psql'), '#!/bin/sh\nprintf %s "$1" > "$(dirname "$0")/url"\necho 1024\n');
    chmodSync(join(dir, 'psql'), 0o755);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const psqlUrl = (databaseUrl: string) => {
    const result = spawnSync('bash', ['-c', queryStep], {
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        DATABASE_URL: databaseUrl,
        GITHUB_OUTPUT: join(dir, 'output'),
        QUOTA_BYTES: '524288000',
      },
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    return new URL(readFileSync(join(dir, 'url'), 'utf-8'));
  };

  it('finds the query step script', () => {
    expect(queryStep).toContain('psql');
  });

  it.each([
    'postgresql://u:p@db.example.com:5432/postgres',
    'postgresql://u:p@db.example.com:5432/postgres?connect_timeout=10',
    'postgresql://u:p@db.example.com:5432/postgres?sslmode=disable',
    'postgresql://u:p@db.example.com:5432/postgres?sslmode=require&uselibpqcompat=true',
  ])('connects over TLS for %s', (databaseUrl) => {
    const url = psqlUrl(databaseUrl);
    expect(url.search.indexOf('?', 1)).toBe(-1);
    expect(url.searchParams.getAll('sslmode').at(-1)).toBe('require');
  });
});
