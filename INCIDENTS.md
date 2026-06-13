# Incident Report: #898 Production Health Check Outage

**Date**: 2026-06-13  
**Issue**: [#898 - Main CI red: Production Health Check](https://github.com/alexsiri7/word-coach-annie/issues/898)  
**Status**: RESOLVED  

## Timeline

- **09:07 UTC**: Deployment of commit `3d6f12e` ("Fix: offline mode shows browser error instead of app shell #896") to production
- **09:21 UTC**: Post-deploy health check passed — production API returning `{"status":"ok"}`
- **09:39 UTC**: Uptime monitor detected production unreachable (TCP timeout, not HTTP error)
- **10:00 UTC**: Investigation identified infrastructure issue (container crash, not code bug)
- **10:18 UTC**: Re-deployed via `workflow_dispatch` on Staging → Production Pipeline
- **10:25 UTC**: Production fully recovered — health check passing, all E2E tests passing

## Root Cause

Railway production container crashed ~18 minutes after deployment of `3d6f12e`. This was determined to be an infrastructure issue, not a code defect, because:

1. **Staging is healthy**: Same codebase (`3d6f12e`) runs without issue on staging environment
2. **No server-side code changes**: PR #896 only modified client-side code (service worker, offline UI) and build config
3. **Timing correlation**: Container crash occurred shortly after deploy, likely due to OOM or resource exhaustion under load

## Resolution

Triggered a fresh production re-deploy via GitHub Actions `workflow_dispatch` on the Staging → Production Pipeline. This cleanly restarted the Railway container, resolving the outage.

**No code changes were required or made.** The codebase in commit `3d6f12e` is correct and remains in production.

## Validation

- ✅ Type check: 0 errors
- ✅ Lint: 0 errors (150 pre-existing warnings)
- ✅ Build: Compiled successfully
- ✅ E2E tests (staging): 14/14 passed
- ✅ Health check (production): `{"status":"ok"}`
- ✅ Uptime monitor: Auto-closed related issues

**Pipeline run**: Staging → Production re-deploy via `workflow_dispatch`  
https://github.com/alexsiri7/word-coach-annie/actions/runs/27463812461

## Prevention

To prevent similar outages:
1. Monitor production container memory/CPU usage on Railway dashboard — tracked in #900
2. Consider bumping Railway memory limits if production instance is smaller than staging — tracked in #900
3. Uptime monitor already configured to auto-detect and auto-file recovery reports ✅

## References

- Investigation: Infrastructure recovery via workflow dispatch re-deploy
- Previous related incident: #779, #546, #545
