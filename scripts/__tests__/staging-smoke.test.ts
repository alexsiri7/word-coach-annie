import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

interface Step {
  name?: string;
  run?: string;
  with?: { script?: string };
}

const workflow = parse(
  readFileSync(join(__dirname, '../../.github/workflows/staging-smoke.yml'), 'utf-8'),
) as { jobs: Record<string, { steps: Step[] }> };

const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);

// Actions expands ${{ }} into the script text before bash or github-script parses it, so a
// step output spliced there can rewrite the script; outputs must reach it through env (#1589).
describe('staging → production pipeline', () => {
  it.each(steps.filter((step) => step.run ?? step.with?.script))(
    'keeps expressions out of the "$name" script',
    (step) => {
      expect(step.run ?? step.with?.script).not.toContain('${{');
    },
  );

  it('covers the deploy, alert and failure-issue scripts', () => {
    expect(steps.filter((step) => step.run ?? step.with?.script).map((step) => step.name)).toEqual(
      expect.arrayContaining([
        'Deploy staging commit to production',
        'Send ntfy alert',
        'Create failure issue',
      ]),
    );
  });
});
