import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { filterAuditVulnerabilities, findStaleAllowlistEntries } from '../audit-filter.mjs';

describe('filterAuditVulnerabilities()', () => {
  it('flags moderate vulnerabilities not in the allowlist', () => {
    const audit = {
      vulnerabilities: {
        'some-pkg': {
          via: [{ url: 'https://npmjs.com/advisories/12345', severity: 'moderate' }],
        },
      },
    };
    const novel = filterAuditVulnerabilities(audit, []);
    expect(novel).toContain('12345');
  });

  it('does not flag moderate vulnerabilities already in the allowlist', () => {
    const audit = {
      vulnerabilities: {
        'some-pkg': {
          via: [{ url: 'https://npmjs.com/advisories/12345', severity: 'moderate' }],
        },
      },
    };
    const novel = filterAuditVulnerabilities(audit, ['12345']);
    expect(novel).toHaveLength(0);
  });

  it('flags high vulnerabilities not in the allowlist', () => {
    const audit = {
      vulnerabilities: {
        'pkg-a': { via: [{ url: 'https://npmjs.com/advisories/111', severity: 'high' }] },
      },
    };
    const novel = filterAuditVulnerabilities(audit, []);
    expect(novel).toContain('111');
  });

  it('flags critical vulnerabilities not in the allowlist', () => {
    const audit = {
      vulnerabilities: {
        'pkg-b': { via: [{ url: 'https://npmjs.com/advisories/222', severity: 'critical' }] },
      },
    };
    const novel = filterAuditVulnerabilities(audit, []);
    expect(novel).toContain('222');
  });

  it('ignores low severity vulnerabilities', () => {
    const audit = {
      vulnerabilities: {
        'some-pkg': { via: [{ url: 'https://npmjs.com/advisories/999', severity: 'low' }] },
      },
    };
    const novel = filterAuditVulnerabilities(audit, []);
    expect(novel).toHaveLength(0);
  });

  it('ignores info severity vulnerabilities', () => {
    const audit = {
      vulnerabilities: {
        'some-pkg': { via: [{ url: 'https://npmjs.com/advisories/888', severity: 'info' }] },
      },
    };
    const novel = filterAuditVulnerabilities(audit, []);
    expect(novel).toHaveLength(0);
  });

  it('deduplicates advisories that appear in multiple packages', () => {
    const audit = {
      vulnerabilities: {
        'pkg-a': { via: [{ url: 'https://npmjs.com/advisories/12345', severity: 'moderate' }] },
        'pkg-b': { via: [{ url: 'https://npmjs.com/advisories/12345', severity: 'moderate' }] },
      },
    };
    const novel = filterAuditVulnerabilities(audit, []);
    expect(novel).toHaveLength(1);
    expect(novel).toContain('12345');
  });

  it('handles empty vulnerabilities object', () => {
    const novel = filterAuditVulnerabilities({ vulnerabilities: {} }, []);
    expect(novel).toHaveLength(0);
  });

  it('handles missing vulnerabilities key', () => {
    const novel = filterAuditVulnerabilities({}, []);
    expect(novel).toHaveLength(0);
  });

  it('skips string-typed via entries (transitive advisories)', () => {
    const audit = {
      vulnerabilities: {
        'some-pkg': {
          via: ['transitive-dep-name'],
        },
      },
    };
    const novel = filterAuditVulnerabilities(audit, []);
    expect(novel).toHaveLength(0);
  });

  it('handles mixed via entries (objects and strings)', () => {
    const audit = {
      vulnerabilities: {
        'some-pkg': {
          via: [
            'transitive-dep-name',
            { url: 'https://npmjs.com/advisories/777', severity: 'high' },
          ],
        },
      },
    };
    const novel = filterAuditVulnerabilities(audit, []);
    expect(novel).toEqual(['777']);
  });

  it('allowlist blocks some but not all advisories', () => {
    const audit = {
      vulnerabilities: {
        'pkg-a': { via: [{ url: 'https://npmjs.com/advisories/111', severity: 'high' }] },
        'pkg-b': { via: [{ url: 'https://npmjs.com/advisories/222', severity: 'critical' }] },
        'pkg-c': { via: [{ url: 'https://npmjs.com/advisories/333', severity: 'moderate' }] },
      },
    };
    const novel = filterAuditVulnerabilities(audit, ['111', '333']);
    expect(novel).toEqual(['222']);
  });
});

describe('findStaleAllowlistEntries()', () => {
  const audit = {
    vulnerabilities: {
      'pkg-a': { via: [{ url: 'https://github.com/advisories/GHSA-mod', severity: 'moderate' }] },
      'pkg-b': { via: [{ url: 'https://github.com/advisories/GHSA-low', severity: 'low' }] },
    },
  };

  it('returns allowlisted advisories absent from the report', () => {
    expect(findStaleAllowlistEntries(audit, ['GHSA-mod', 'GHSA-gone'])).toEqual(['GHSA-gone']);
  });

  it('does not return an advisory still reported at moderate', () => {
    expect(findStaleAllowlistEntries(audit, ['GHSA-mod'])).toEqual([]);
  });

  it('does not return an advisory still reported below moderate', () => {
    expect(findStaleAllowlistEntries(audit, ['GHSA-low'])).toEqual([]);
  });

  it('returns nothing for an empty allowlist', () => {
    expect(findStaleAllowlistEntries(audit, [])).toEqual([]);
  });
});

describe('audit-filter CLI', () => {
  const SCRIPT = join(__dirname, '../audit-filter.mjs');
  const AUDIT = JSON.stringify({
    vulnerabilities: {
      'pkg-a': { via: [{ url: 'https://github.com/advisories/GHSA-live', severity: 'high' }] },
    },
  });
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'audit-filter-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function runFilter(allowlist: string[], input: string) {
    const allowlistPath = join(dir, 'allowlist');
    writeFileSync(allowlistPath, ['# comment', ...allowlist].join('\n') + '\n');
    return spawnSync('node', [SCRIPT, allowlistPath], { input, encoding: 'utf-8' });
  }

  it('fails and names allowlist entries npm audit no longer reports', () => {
    const result = runFilter(['GHSA-live', 'GHSA-gone'], AUDIT);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GHSA-gone');
    expect(result.stderr).not.toContain('GHSA-live');
  });

  it('fails when npm audit returns an error instead of a report', () => {
    const result = runFilter(['GHSA-live'], JSON.stringify({ message: 'x', error: {} }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('did not return a vulnerability report');
  });

  it('passes when the allowlist matches the report', () => {
    const result = runFilter(['GHSA-live'], AUDIT);
    expect(result.status).toBe(0);
  });
});
