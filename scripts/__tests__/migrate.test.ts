import { spawnSync } from 'child_process';
import { join } from 'path';

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
