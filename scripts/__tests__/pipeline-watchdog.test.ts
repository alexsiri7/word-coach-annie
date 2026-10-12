import { readFileSync } from 'fs';
import { join } from 'path';

// The watchdog deploys whenever it finds a green CI run at main HEAD, so it
// must ignore CI runs that were dispatched rather than pushed.
describe('pipeline watchdog CI lookup', () => {
  const workflows = join(__dirname, '../../.github/workflows');
  const watchdog = readFileSync(join(workflows, 'pipeline-watchdog.yml'), 'utf-8');
  const ci = readFileSync(join(workflows, 'ci.yml'), 'utf-8');

  it('only counts push-triggered CI runs', () => {
    expect(watchdog).toContain('--event push');
  });

  it('references CI by its workflow name', () => {
    const name = ci.match(/^name:\s*(.+)$/m)?.[1].trim();
    expect(name).toBeTruthy();
    expect(watchdog).toContain(`--workflow "${name}"`);
  });

  // interstellarai.net's build-drift check refuses to dispatch CI while another workflow names its file.
  it('does not name the CI workflow file', () => {
    expect(watchdog).not.toContain('ci.yml');
  });
});
