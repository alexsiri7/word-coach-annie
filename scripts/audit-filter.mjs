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
  const ids = Object.keys(audit.vulnerabilities || {})
    .flatMap(k => (audit.vulnerabilities[k].via || []))
    .filter(v => v?.url && ['high', 'critical', 'moderate'].includes(v.severity))
    .map(v => v.url.split('/').pop());
  return [...new Set(ids)].filter(id => !allow.includes(id));
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
    const novel = filterAuditVulnerabilities(audit, allow);
    if (novel.length) {
      console.error('New moderate/high/critical vulnerabilities not in allowlist: ' + novel.join(', '));
      process.exit(1);
    }
    console.log('No new moderate/high/critical vulnerabilities (allowlisted: ' + allow.length + ' known advisories).');
  });
}
