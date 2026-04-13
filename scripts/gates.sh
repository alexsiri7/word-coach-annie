#!/usr/bin/env bash
# gates.sh — Single source of truth for all quality gates.
# Called by: polecats (pre-verify), refinery (fallback), CI (GitHub Actions).
#
# Usage:
#   ./scripts/gates.sh [STAGE...]
#
# Stages (default): setup, lint, typecheck, test, build
# Stages (opt-in, not run by default): audit, screenshots
# No args = run all stages in order.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

run_setup() {
    echo "=== Setup ==="
    npm ci
}

run_lint() {
    echo "=== Lint ==="
    npm run lint
}

run_typecheck() {
    echo "=== Typecheck ==="
    npm run typecheck
}

run_test() {
    echo "=== Test ==="
    npm run test:coverage
}

run_build() {
    echo "=== Build (Docker) ==="
    docker build -t word-coach-annie:gate-check .
}

run_audit() {
    echo "=== Audit ==="
    ALLOWLIST=".audit-allowlist"
    # Capture audit JSON regardless of exit code (non-zero = vulns found)
    AUDIT_JSON=$(npm audit --json --audit-level=high 2>/dev/null || true)
    # Fail only on high/critical advisories NOT in the allowlist
    echo "$AUDIT_JSON" | node -e "
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  const fs = require('fs');
  const allowlist = '${ALLOWLIST}';
  const allow = fs.existsSync(allowlist)
    ? fs.readFileSync(allowlist, 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
    : [];
  const d = JSON.parse(chunks.join(''));
  const ids = Object.keys(d.vulnerabilities || {})
    .flatMap(k => (d.vulnerabilities[k].via || []))
    .filter(v => v && v.url && (v.severity === 'high' || v.severity === 'critical'))
    .map(v => v.url.split('/').pop());
  const novel = [...new Set(ids)].filter(id => !allow.includes(id));
  if (novel.length) {
    console.error('New high/critical vulnerabilities not in allowlist: ' + novel.join(', '));
    process.exit(1);
  }
  console.log('No new high/critical vulnerabilities (allowlisted: ' + allow.length + ' known advisories).');
});
"
}

run_screenshots() {
    echo "=== Screenshots (Visual Regression) ==="
    npx playwright test e2e/visual.spec.ts
}

# If no args, run all stages (audit and screenshots are opt-in only)
if [ $# -eq 0 ]; then
    STAGES=(setup lint typecheck test build)
else
    STAGES=("$@")
fi

FAILED=0
for stage in "${STAGES[@]}"; do
    if ! "run_${stage}"; then
        echo "FAILED: ${stage}"
        FAILED=1
        break
    fi
    echo "PASSED: ${stage}"
    echo ""
done

if [ $FAILED -eq 0 ]; then
    echo "=== All gates passed ==="
else
    echo "=== Gates FAILED ==="
    exit 1
fi
