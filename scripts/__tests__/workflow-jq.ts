import { spawnSync } from 'child_process';
import { expect } from 'vitest';

/** The jq filter a workflow step applies in `NAME=$(echo "$VAR" | jq -r '<filter>')`, or '' when absent. */
export function workflowJqFilter(workflow: string, name: string): string {
  return workflow.match(new RegExp(`${name}=\\$\\(echo "\\$\\w+" \\| jq -r '([^']*)'\\)`))?.[1] ?? '';
}

/** Runs `filter` through the real jq binary on `input` as JSON and returns its trimmed output. */
export function runJq(filter: string, input: unknown): string {
  const result = spawnSync('jq', ['-r', filter], { input: JSON.stringify(input), encoding: 'utf-8' });
  expect(result.status).toBe(0);
  return result.stdout.trim();
}
