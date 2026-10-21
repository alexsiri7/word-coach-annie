import { createRequire } from 'module';
import { transportSecurityProblems } from '../transport-security.mjs';

// The parser pg itself applies to DATABASE_URL, resolved from pg's own location.
const requireFromPg = createRequire(createRequire(import.meta.url).resolve('pg'));
const parsePgUrl: (url: string) => { ssl?: unknown } = requireFromPg('pg-connection-string').parse;

const DB = 'postgresql://postgres.ref:s3cret-pw@aws-0-eu.pooler.supabase.com:6543/postgres';

describe('transportSecurityProblems()', () => {
  it.each([
    ['nothing set', {}],
    ['libpq-compatible require', { DATABASE_URL: `${DB}?sslmode=require&uselibpqcompat=true` }],
    ['verify-full after another param', { DATABASE_URL: `${DB}?uselibpqcompat=true&sslmode=verify-full` }],
    ['a rediss:// Redis URL', { REDIS_URL: 'rediss://u:p@h:6380' }],
    ['an empty Redis URL', { REDIS_URL: '' }],
  ])('accepts %s', (_, env) => {
    expect(transportSecurityProblems(env)).toEqual([]);
  });

  it.each([
    `${DB}?sslmode=require&uselibpqcompat=true`,
    `${DB}?uselibpqcompat=true&sslmode=verify-full`,
    `${DB}?sslmode=no-verify`,
    `${DB}?sslmode=disable&sslmode=require`,
  ])('only accepts database URLs pg connects to over TLS: %s', (url) => {
    expect(transportSecurityProblems({ DATABASE_URL: url })).toEqual([]);
    expect(parsePgUrl(url).ssl).toBeTruthy();
  });

  it.each([
    ['a database URL with no query string', { DATABASE_URL: DB }],
    ['sslmode=disable', { DATABASE_URL: `${DB}?sslmode=disable` }],
    ['sslmode=prefer, which can fall back to plaintext', { DATABASE_URL: `${DB}?sslmode=prefer` }],
    ['a repeated sslmode whose last value is disable', { DATABASE_URL: `${DB}?sslmode=require&sslmode=disable` }],
    ['an sslmode=require hidden in the fragment', { DATABASE_URL: `${DB}?sslmode=disable#&sslmode=require` }],
    ['a redis:// Redis URL', { REDIS_URL: 'redis://localhost:6379' }],
    ['a whitespace-only Redis URL, which the rate limiter treats as set', { REDIS_URL: ' ' }],
  ])('rejects %s', (_, env) => {
    expect(transportSecurityProblems(env)).toHaveLength(1);
  });

  it('reports both URLs when both are plaintext', () => {
    expect(
      transportSecurityProblems({ DATABASE_URL: DB, REDIS_URL: 'redis://localhost:6379' }),
    ).toHaveLength(2);
  });

  it('never echoes the password', () => {
    const problems = transportSecurityProblems({
      DATABASE_URL: `${DB}?sslmode=disable`,
      REDIS_URL: 'redis://u:s3cret-pw@h:6379',
    });
    expect(problems).toHaveLength(2);
    for (const problem of problems) expect(problem).not.toContain('s3cret-pw');
  });
});
