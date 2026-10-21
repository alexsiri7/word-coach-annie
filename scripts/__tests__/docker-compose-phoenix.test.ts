import { readFileSync } from 'fs';
import { join } from 'path';

// Phoenix stores AI traces; it must require auth and stay off the network the
// Cloudflare tunnel shares, or traces become readable from the tunnel's path.
describe('docker-compose Phoenix isolation', () => {
  const compose = readFileSync(join(__dirname, '../../docker-compose.yml'), 'utf-8');

  const service = (name: string) =>
    compose.match(new RegExp(`^  ${name}:\\n((?:    .*\\n|\\s*\\n)*)`, 'm'))?.[1] ?? '';
  const list = (block: string, key: string) =>
    [...(block.match(new RegExp(`^    ${key}:\\n((?:      - .*\\n)*)`, 'm'))?.[1] ?? '')
      .matchAll(/^      - "?(.*?)"?$/gm)].map((m) => m[1]);

  it('puts Phoenix on the telemetry network only', () => {
    expect(list(service('phoenix'), 'networks')).toEqual(['telemetry']);
  });

  it('keeps the tunnel off the telemetry network', () => {
    const networks = list(service('tunnel'), 'networks');
    expect(networks).not.toHaveLength(0);
    expect(networks).not.toContain('telemetry');
  });

  it('lets the app reach Phoenix with its admin token', () => {
    const app = service('app');
    expect(list(app, 'networks')).toContain('telemetry');
    expect(list(app, 'environment')).toContainEqual(
      expect.stringMatching(/^OTEL_EXPORTER_OTLP_TRACES_HEADERS=Authorization=Bearer \$\{PHOENIX_ADMIN_SECRET:\?/),
    );
  });

  it('requires Phoenix auth with both secrets set', () => {
    const env = list(service('phoenix'), 'environment');
    expect(env).toContain('PHOENIX_ENABLE_AUTH=True');
    expect(env).toContainEqual(expect.stringMatching(/^PHOENIX_SECRET=\$\{PHOENIX_SECRET:\?/));
    expect(env).toContainEqual(expect.stringMatching(/^PHOENIX_ADMIN_SECRET=\$\{PHOENIX_ADMIN_SECRET:\?/));
  });
});
