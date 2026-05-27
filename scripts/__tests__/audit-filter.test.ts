import { filterAuditVulnerabilities } from '../audit-filter.mjs';

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
