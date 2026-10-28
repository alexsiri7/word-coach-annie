import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

interface ComposeService {
  environment?: string[];
}

function services(file: string): Record<string, ComposeService> {
  return (parse(readFileSync(join(__dirname, '../..', file), 'utf-8')) as {
    services: Record<string, ComposeService>;
  }).services;
}

// In development auth is off unless API_TOKEN is set, so the tunnel must never
// publish the dev server without one.
describe('dev compose tunnel', () => {
  it('is not part of the default dev stack', () => {
    expect(services('docker-compose.dev.yml')).not.toHaveProperty('tunnel');
  });

  it('refuses to start without API_TOKEN and hands it to the app', () => {
    const overlay = services('docker-compose.tunnel.yml');
    expect(overlay).toHaveProperty('tunnel');
    expect(overlay.app.environment).toContainEqual(
      expect.stringMatching(/^API_TOKEN=\$\{API_TOKEN:\?/),
    );
  });
});
