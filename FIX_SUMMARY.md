# Fix Summary: Prod Deploy OOM Crash (Issue #978)

**Status**: Fixed in PR #980  
**Date**: 2026-08-18  
**Impact**: Production deployment failure due to OOM crash

## Root Cause

V8 heap memory cap of 420 MB was not updated when Railway plan was upgraded from 512 MB to 1 GB. Under transient load from recent dependency bumps, the container OOM-crashed.

## Solution

PR #980 implements:
1. Raise `--max-old-space-size` from 420 to 768 MB in `Dockerfile`
2. Add `take` limit to `allMessages` query in `src/app/api/chat/route.ts`

## Validation

All CI checks (lint, type check, build, tests, E2E) passed on PR #980 before merge.
See [PR #980](https://github.com/alexsiri7/word-coach-annie/pull/980) for full CI results.

## Required Actions

1. Verify Railway memory limit is 1024 MB before merge
   > **WARNING**: Do NOT merge PR #980 until Railway memory is upgraded to 1024 MB.
   > Deploying the 768 MB heap cap into a 512 MB container will cause an immediate OOM crash.
2. Merge PR #980 to deploy fix
3. Verify `/api/health` health check recovers post-deploy

See PR #980 for full implementation details and investigation documentation.
