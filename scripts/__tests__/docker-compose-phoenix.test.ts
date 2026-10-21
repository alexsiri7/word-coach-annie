import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

interface ComposeService {
  networks?: string[];
  environment?: string[];
}

// Phoenix stores AI traces; it must require auth and stay off the network the
// Cloudflare tunnel shares, or traces become readable from the tunnel's path.
describe('docker-compose Phoenix isolation', () => {
  const { services } = parse(
    readFileSync(join(__dirname, '../../docker-compose.yml'), 'utf-8'),
  ) as { services: Record<string, ComposeService> };

  it('puts Phoenix on the telemetry network only', () => {
    expect(services.phoenix.networks).toEqual(['telemetry']);
  });

  it('keeps the tunnel off the telemetry network', () => {
    const networks = services.tunnel.networks;
    expect(networks).not.toHaveLength(0);
    expect(networks).not.toContain('telemetry');
  });

  it('lets the app reach Phoenix with its admin token', () => {
    expect(services.app.networks).toContain('telemetry');
    expect(services.app.environment).toContainEqual(
      expect.stringMatching(/^OTEL_EXPORTER_OTLP_TRACES_HEADERS=Authorization=Bearer \$\{PHOENIX_ADMIN_SECRET:\?/),
    );
  });

  it('requires Phoenix auth with both secrets set', () => {
    const env = services.phoenix.environment;
    expect(env).toContain('PHOENIX_ENABLE_AUTH=True');
    expect(env).toContainEqual(expect.stringMatching(/^PHOENIX_SECRET=\$\{PHOENIX_SECRET:\?/));
    expect(env).toContainEqual(expect.stringMatching(/^PHOENIX_ADMIN_SECRET=\$\{PHOENIX_ADMIN_SECRET:\?/));
  });
});
