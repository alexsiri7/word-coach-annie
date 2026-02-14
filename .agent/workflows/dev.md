---
description: Mandatory development workflow - MUST follow for every code change
---

# Development Workflow (Stability Rules)

> **CRITICAL**: Follow this workflow for EVERY code change, no exceptions.
> Skipping steps has caused production breakage multiple times.

## Pre-Change Checklist

Before writing any code:
1. Read `docs/memory-bank/activeContext.md` to understand what's being worked on
2. Read `docs/memory-bank/decisionLog.md` for past decisions you must respect
3. Identify which files you will modify and verify you understand the current behavior

## Step 1: Run Tests Before You Start
// turbo
```bash
docker compose exec app npm run test:run
```
If any tests fail, **STOP**. Fix them before making changes. Never start work on a failing test suite.

## Step 2: Make Your Changes

- Make the **smallest possible change** that achieves the goal
- Do NOT refactor unrelated code
- Do NOT change imports, exports, or function signatures unless that is the explicit goal
- If modifying the Prisma schema, follow the Schema Change steps below

## Step 3: Run TypeScript Check
// turbo
```bash
docker compose exec app npx tsc --noEmit
```
If there are type errors, fix them. Do NOT suppress with `any` or `@ts-ignore`.

## Step 4: Run Tests Again
// turbo
```bash
docker compose exec app npm run test:run
```
All tests must pass. If a test fails:
- If your change intentionally changes behavior, update the test to match
- If the failure is unexpected, **revert your change** and investigate

## Step 5: Verify the App Builds
// turbo
```bash
docker compose exec app npm run build
```
If the build fails, fix it before committing. Common issues:
- Server components importing client-only code (Tiptap, hooks)
- Missing `"use client"` directive
- Broken imports after renaming

## Step 6: Smoke Test the Running App
// turbo
```bash
docker compose exec app curl -s http://localhost:3000/api/projects | head -c 200
```
Verify the app responds. If using the browser, check:
- Dashboard loads
- Project page loads
- Scene editor loads without errors

## Step 7: Update Documentation
- Update `docs/memory-bank/progress.md` with what you did
- Update `docs/memory-bank/activeContext.md` if context changed
- If you made a design decision, log it in `docs/memory-bank/decisionLog.md`

## Step 8: Commit
```bash
git add -A && git commit -m "descriptive message"
```

---

## Schema Change Steps

If you modify `prisma/schema.prisma`:

// turbo
1. Regenerate the Prisma client:
```bash
docker compose exec app npx prisma generate
```

// turbo
2. Push the schema to the database:
```bash
docker compose exec app npx prisma db push
```

// turbo
3. Restart the app to pick up the new client:
```bash
docker compose restart app
```

4. Wait for the app to be ready (~10 seconds), then run the full test suite (Step 4).

---

## What NOT To Do

- ❌ Do NOT delete or rename files without updating all imports
- ❌ Do NOT change the Prisma schema without running generate + push + restart
- ❌ Do NOT add new dependencies without verifying they work inside Docker
- ❌ Do NOT skip the build step — SSR issues only surface during build
- ❌ Do NOT modify multiple unrelated features in one change
- ❌ Do NOT make design decisions — if something is ambiguous, ask the user
