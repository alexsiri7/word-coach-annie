import { readFileSync } from 'fs';
import { join } from 'path';

function read(file: string): string {
  return readFileSync(join(__dirname, '../..', file), 'utf-8');
}

// Anything not excluded here is copied into the production image by `COPY . .`.
describe('.dockerignore', () => {
  const patterns = read('.dockerignore').split('\n').map((line) => line.trim());

  it.each(['.env*', '*.pem', '*.key', '*.p12', 'coverage', 'playwright-report', 'test-results', 'e2e'])(
    'excludes %s from the build context',
    (pattern) => {
      expect(patterns).toContain(pattern);
    },
  );

  it('keeps only .env.example from the env files', () => {
    expect(patterns.filter((p) => p.startsWith('!'))).toEqual(['!.env.example']);
  });
});

describe('dev server binding', () => {
  const { scripts } = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

  it('binds npm run dev to localhost', () => {
    expect(scripts.dev).toMatch(/ -H 127\.0\.0\.1$/);
  });

  it('exposes the dev server to the LAN only through dev:lan', () => {
    expect(scripts['dev:lan']).toMatch(/ -H 0\.0\.0\.0$/);
    expect(scripts['dev:secure']).toMatch(/ -H 127\.0\.0\.1$/);
  });
});
