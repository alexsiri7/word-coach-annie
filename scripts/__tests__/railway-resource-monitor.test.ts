import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

// Railway sums every container instance of a service unless the metrics query is grouped, so a
// rolling deploy's old and new containers read as one container at twice the usage (#1453).
describe('railway resource monitor', () => {
  const monitor = readFileSync(
    join(__dirname, '../../.github/workflows/railway-resource-monitor.yml'),
    'utf-8',
  );
  const query = monitor.match(/metrics\([^)]*\)/)?.[0] ?? '';
  const memoryFilter = monitor.match(/MEMORY_GB=\$\(echo "\$METRICS_RESPONSE" \| jq -r '([^']*)'\)/)?.[1] ?? '';
  const cpuFilter = monitor.match(/CPU_PCT=\$\(echo "\$METRICS_RESPONSE" \| jq -r '([^']*)'\)/)?.[1] ?? '';

  const instance = (memory: number[], cpu: number[]) => [
    { measurement: 'MEMORY_USAGE_GB', values: memory.map((value) => ({ value })) },
    { measurement: 'CPU_USAGE', values: cpu.map((value) => ({ value })) },
  ];
  const runJqFilter = (filter: string, metrics: unknown[]) => {
    const result = spawnSync('jq', ['-r', filter], {
      input: JSON.stringify({ data: { metrics } }),
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    return Number(result.stdout.trim());
  };
  const memoryGb = (metrics: unknown[]) => runJqFilter(memoryFilter, metrics);
  const cpuPct = (metrics: unknown[]) => runJqFilter(cpuFilter, metrics);

  it('finds the metrics query and memory extraction', () => {
    expect(query).not.toBe('');
    expect(memoryFilter).not.toBe('');
    expect(cpuFilter).not.toBe('');
  });

  it('queries one series per container instance', () => {
    expect(query).toContain('groupBy: [DEPLOYMENT_INSTANCE_ID]');
  });

  it('reports the per-instance memory peak, not the sum across instances', () => {
    expect(memoryGb([...instance([0.29, 0.3], [5]), ...instance([0.25], [7])])).toBe(0.3);
  });

  it('reports zero when Railway returns no samples', () => {
    expect(memoryGb([])).toBe(0);
  });

  it('reports the per-instance CPU peak, not the sum across instances', () => {
    expect(cpuPct([...instance([0.29, 0.3], [5]), ...instance([0.25], [7])])).toBe(7);
  });

  it('reports zero CPU when Railway returns no samples', () => {
    expect(cpuPct([])).toBe(0);
  });
});
