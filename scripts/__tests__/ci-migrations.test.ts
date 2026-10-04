import { readFileSync } from 'fs';
import { join } from 'path';

// The e2e job must exercise the same migrations production applies; `db push`
// would build the schema straight from schema.prisma and hide migration drift.
describe('CI e2e database setup', () => {
  const ci = readFileSync(join(__dirname, '../../.github/workflows/ci.yml'), 'utf-8');

  it('applies the real migrations', () => {
    expect(ci).toContain('node scripts/migrate.mjs');
  });

  it('never pushes the schema with data loss accepted', () => {
    expect(ci).not.toContain('--accept-data-loss');
  });
});
