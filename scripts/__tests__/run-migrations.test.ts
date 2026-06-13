import { spawnSync } from 'child_process';
import { join } from 'path';

describe('run-migrations.ts — DATABASE_URL guard', () => {
  it('exits with code 1 when DATABASE_URL is not set', () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;

    const result = spawnSync(
      join(__dirname, '../../node_modules/.bin/tsx'),
      [join(__dirname, '../run-migrations.ts')],
      { env, encoding: 'utf-8' }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL is required');
  });
});
