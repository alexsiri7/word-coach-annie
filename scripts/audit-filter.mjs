import { readFileSync, existsSync } from 'fs';

/**
 * Filters npm audit JSON vulnerabilities to find novel advisories not in the allowlist.
 *
 * Only direct advisories (via[] entries with a .url) are matched; string-typed
 * transitive entries are skipped (npm audit v2 also emits them as root objects
 * elsewhere in the vulnerabilities map, so the practical risk is low).
 *
 * @param {object} audit - Parsed npm audit --json output
 * @param {string[]} allow - Advisory IDs already in the allowlist (no prefix)
 * @returns {string[]} Novel advisory IDs not in the allowlist
 */
export function filterAuditVulnerabilities(audit, allow) {
  const ids = directAdvisories(audit)
    .filter(v => ['high', 'critical', 'moderate'].includes(v.severity))
    .map(advisoryId);
  return [...new Set(ids)].filter(id => !allow.includes(id));
}

/**
 * Finds allowlist entries that npm audit no longer reports.
 *
 * Severity is ignored, so an advisory downgraded below moderate is not reported
 * as stale while it is still in the dependency tree.
 *
 * @param {object} audit - Parsed npm audit --json output
 * @param {string[]} allow - Advisory IDs in the allowlist (no prefix)
 * @returns {string[]} Allowlisted advisory IDs absent from the audit, in allowlist order
 */
export function findStaleAllowlistEntries(audit, allow) {
  const reported = new Set(directAdvisories(audit).map(advisoryId));
  return [...new Set(allow)].filter(id => !reported.has(id));
}

function directAdvisories(audit) {
  return Object.values(audit.vulnerabilities || {})
    .flatMap(vuln => vuln.via || [])
    .filter(v => v?.url);
}

function advisoryId(advisory) {
  return advisory.url.split('/').pop();
}

// CLI runner: node scripts/audit-filter.mjs <allowlist-file>
// Reads npm audit --json output from stdin.
const isMain = process.argv[1] && process.argv[1].endsWith('audit-filter.mjs');
if (isMain) {
  const allowlistPath = process.argv[2] || '.audit-allowlist';
  const allow = existsSync(allowlistPath)
    ? readFileSync(allowlistPath, 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
    : [];

  const chunks = [];
  process.stdin.on('data', d => chunks.push(d));
  process.stdin.on('end', () => {
    const audit = JSON.parse(chunks.join(''));
    if (audit.error || typeof audit.vulnerabilities !== 'object' || audit.vulnerabilities === null) {
      console.error('npm audit did not return a vulnerability report: ' + (audit.message ?? JSON.stringify(audit.error)));
      process.exit(1);
    }
    const novel = filterAuditVulnerabilities(audit, allow);
    const stale = findStaleAllowlistEntries(audit, allow);
    if (novel.length) {
      console.error('New moderate/high/critical vulnerabilities not in allowlist: ' + novel.join(', '));
    }
    if (stale.length) {
      console.error(`Allowlisted advisories no longer reported by npm audit (delete them from ${allowlistPath}): ` + stale.join(', '));
    }
    if (novel.length || stale.length) {
      process.exit(1);
    }
    console.log('No new moderate/high/critical vulnerabilities (allowlisted: ' + allow.length + ' known advisories).');
  });
}
