import { transportSecurityProblems } from '../transport-security.mjs';

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
    ['a database URL with no query string', { DATABASE_URL: DB }],
    ['sslmode=disable', { DATABASE_URL: `${DB}?sslmode=disable` }],
    ['sslmode=prefer, which can fall back to plaintext', { DATABASE_URL: `${DB}?sslmode=prefer` }],
    ['a redis:// Redis URL', { REDIS_URL: 'redis://localhost:6379' }],
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
