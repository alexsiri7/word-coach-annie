import { spawnSync } from 'child_process';
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

// A failed deploy run proves the dispatch was not dropped; retrying it until an attempt passes would
// ship an intermittent regression past the staging gate (#1587).
describe('pipeline watchdog deploy-run lookup', () => {
  const watchdog = readFileSync(join(__dirname, '../../.github/workflows/pipeline-watchdog.yml'), 'utf-8');
  const filter = (name: string) =>
    watchdog.match(new RegExp(`${name}=\\$\\(echo "\\$PIPELINE_RUNS" \\| jq -r '([^']*)'\\)`))?.[1] ?? '';
  const activeFilter = filter('PIPELINE_EXISTING');
  const failedFilter = filter('PIPELINE_FAILED');

  const runJqFilter = (jqFilter: string, runs: unknown[]) => {
    const result = spawnSync('jq', ['-r', jqFilter], { input: JSON.stringify(runs), encoding: 'utf-8' });
    expect(result.status).toBe(0);
    return result.stdout.trim();
  };
  const active = (runs: unknown[]) => runJqFilter(activeFilter, runs);
  const failed = (runs: unknown[]) => runJqFilter(failedFilter, runs);
  const run = (databaseId: number, status: string, conclusion = '') => ({ databaseId, status, conclusion });

  it('finds both deploy-run filters', () => {
    expect(activeFilter).not.toBe('');
    expect(failedFilter).not.toBe('');
  });

  it('dispatches when no deploy run exists for the SHA', () => {
    expect(active([])).toBe('');
    expect(failed([])).toBe('');
  });

  it.each(['failure', 'cancelled', 'timed_out'])('halts on a %s run instead of retrying it', (conclusion) => {
    const runs = [run(7, 'completed', conclusion)];
    expect(active(runs)).toBe('');
    expect(failed(runs)).toBe('7');
  });

  it.each(['in_progress', 'queued', 'pending'])('treats a %s run as active', (status) => {
    expect(active([run(8, status)])).toBe('8');
  });

  it('reports a later successful run over an earlier failure', () => {
    expect(active([run(9, 'completed', 'success'), run(7, 'completed', 'failure')])).toBe('9');
  });

  it('exits on a failed run before reaching the dispatch', () => {
    const halt = watchdog.indexOf('if [ -n "$PIPELINE_FAILED" ]');
    const dispatch = watchdog.indexOf('gh workflow run staging-smoke.yml');
    expect(halt).toBeGreaterThan(-1);
    expect(halt).toBeLessThan(dispatch);
    expect(watchdog.slice(halt, dispatch)).toContain('exit 0');
  });
});
