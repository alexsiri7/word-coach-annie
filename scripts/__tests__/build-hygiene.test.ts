import { readdirSync, readFileSync } from 'fs';
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

// docker-compose.dev.yml bind-mounts the checkout over /app, so a non-root user would not
// own the host files on most machines.
describe('Dockerfile.dev', () => {
  it('keeps the dev container on root so the bind mount works on any host UID', () => {
    expect(read('Dockerfile.dev')).not.toMatch(/^USER\s/m);
  });
});

// The Node major lives in several hand-synced places; Dependabot once bumped only the FROM
// lines (#1586), and .npmrc's engine-strict then failed npm ci inside the image.
describe('Node major', () => {
  const engines = (JSON.parse(read('package.json')) as { engines: { node: string } }).engines.node;
  const major = engines.match(/^(\d+)\.x$/)?.[1];

  it('pins package.json engines to a single major', () => {
    expect(major).toBeDefined();
  });

  it.each(['Dockerfile', 'Dockerfile.dev'])('runs %s on the engines major', (file) => {
    const fromMajors = [...read(file).matchAll(/^FROM node:([^\s@-]+)/gm)].map((m) => m[1]);
    expect(fromMajors.length).toBeGreaterThan(0);
    expect(new Set(fromMajors)).toEqual(new Set([major]));
  });

  it('runs every CI workflow that sets up Node on the engines major', () => {
    const workflows = readdirSync(join(__dirname, '../..', '.github/workflows'));
    const versions = workflows.flatMap((file) =>
      [...read(`.github/workflows/${file}`).matchAll(/node-version:\s*["']?([^"'\s]+)/g)].map((m) => m[1]),
    );
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set([major]));
  });

  it('pins .nvmrc to the engines major', () => {
    expect(read('.nvmrc').trim()).toBe(major);
  });

  it('copies .npmrc before npm ci in both Dockerfiles so engine-strict applies', () => {
    for (const file of ['Dockerfile', 'Dockerfile.dev']) {
      const content = read(file);
      const npmrcCopy = content.search(/^COPY .*\.npmrc/m);
      expect(npmrcCopy).toBeGreaterThanOrEqual(0);
      expect(npmrcCopy).toBeLessThan(content.search(/^RUN npm ci/m));
    }
  });
});
