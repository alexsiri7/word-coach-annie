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
    # --audit-level affects only npm's exit code, not the JSON output content.
    # All vulnerabilities appear in the JSON regardless of this flag; the real
    # enforcement is in audit-filter.mjs. Use || true so set -e doesn't abort
    # before the filter can distinguish novel vs. allowlisted advisories.
    AUDIT_JSON=$(npm audit --json --audit-level=moderate 2>/dev/null || true)
    echo "$AUDIT_JSON" | node scripts/audit-filter.mjs "$ALLOWLIST"
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
