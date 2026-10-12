import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// The watchdog deploys whenever it finds a green CI run at main HEAD, so it
// must ignore CI runs that were dispatched rather than pushed.
describe('pipeline watchdog CI lookup', () => {
  const workflows = join(__dirname, '../../.github/workflows');
  const read = (file: string) => readFileSync(join(workflows, file), 'utf-8');
  const watchdog = read('pipeline-watchdog.yml');
  const ciLookup = watchdog.match(/CI_RUN=\$\(gh run list(?:[^\n]*\\\n)*[^\n]*\)/)?.[0] ?? '';

  it('finds the CI_RUN lookup', () => {
    expect(ciLookup).not.toBe('');
  });

  it('only counts push-triggered CI runs', () => {
    expect(ciLookup).toContain('--event push');
  });

  it('references CI by its workflow name', () => {
    const name = read('ci.yml').match(/^name:\s*(.+)$/m)?.[1].trim();
    expect(name).toBeTruthy();
    expect(ciLookup).toContain(`--workflow "${name}"`);
  });

  // interstellarai.net's build-drift check refuses to dispatch CI while any other workflow names its file.
  it.each(readdirSync(workflows).filter((file) => file.endsWith('.yml') && file !== 'ci.yml'))(
    '%s does not name the CI workflow file',
    (file) => {
      expect(read(file)).not.toContain('ci.yml');
    },
  );
});
