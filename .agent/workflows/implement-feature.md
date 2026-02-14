---
description: How to implement a feature from the future requirements document
---

# Implementing a Feature from FUTURE_REQUIREMENTS.md

> Follow this workflow when picking up any FR (FR1–FR4) from `docs/FUTURE_REQUIREMENTS.md`.
> You are executing a pre-decided plan — do NOT make design decisions.

## Before Starting

// turbo
1. Read the full future requirements doc:
```bash
cat docs/FUTURE_REQUIREMENTS.md
```

2. Read the current requirements to understand what exists:
```bash
cat docs/REQUIREMENTS.md
```

// turbo
3. Run the full test suite to confirm the app is stable:
```bash
docker compose exec app npm run test:run
```

## Implementation Rules

### You MUST:
- Follow the schema, field names, and models **exactly** as specified in FUTURE_REQUIREMENTS.md
- Write tests for every new API route and controller method BEFORE marking the feature complete
- Run the full dev workflow (`/dev`) after every change
- Work in small increments: one model/route/component at a time

### You MUST NOT:
- Change any existing behavior that is not part of the feature you are implementing
- Rename existing models, fields, or tables unless the feature explicitly requires it
- Make architectural decisions not covered by the requirements doc
- Skip writing tests for new code
- Modify the test setup (`setup.ts`) without understanding the impact

## Feature Implementation Order

For each feature, follow this order:
1. **Schema first**: Add Prisma models → generate → push → restart
2. **Controller second**: Add business logic in `src/lib/controllers/`
3. **Tests third**: Write tests in `src/__tests__/` that validate the controller
4. **API routes fourth**: Add Next.js route handlers in `src/app/api/`
5. **MCP tools fifth**: Register tools in `src/mcp/index.ts` using controller functions
6. **UI last**: Add components/pages in `src/app/` and `src/components/`

## After Completing a Feature

// turbo
1. Run the full test suite:
```bash
docker compose exec app npm run test:run
```

// turbo
2. Run a build:
```bash
docker compose exec app npm run build
```

3. Update `docs/memory-bank/progress.md` with what was completed
4. Commit with a descriptive message

## If Something Breaks

1. **Do NOT pile on more changes** — stop and isolate the problem
2. Check the error message carefully
3. If it's a Prisma error: did you run `generate` + `push` + `restart`?
4. If it's a build error: is there a missing `"use client"` or broken import?
5. If you cannot determine the cause, **revert to the last working commit** and start over
