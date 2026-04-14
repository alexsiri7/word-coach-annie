# Developer Guide

This document covers the development workflow, code conventions, testing strategy, and how to contribute to Word Coach Annie.

---

## Development Environment

All tooling runs inside Docker. Do **not** run `npm` or `node` commands on the host.

### Start Dev Server

```bash
# Build and start with hot reload (source is volume-mounted)
docker compose -f docker-compose.dev.yml up

# Detached mode
docker compose -f docker-compose.dev.yml up -d
```

### Run Commands

```bash
docker compose exec app npm run test:run       # Unit tests (once)
docker compose exec app npm run test           # Unit tests (watch mode)
docker compose exec app npm run test:coverage  # With coverage
docker compose exec app npm run typecheck      # TypeScript check
docker compose exec app npm run lint           # ESLint
docker compose exec app npm run build          # Production build
docker compose exec app npx prisma studio      # DB browser (port 5555)
```

### E2E / Screenshot Tests

```bash
docker compose exec app npm run e2e                        # All Playwright tests
docker compose exec app npm run test:screenshots           # Visual regression only
docker compose exec app npm run test:screenshots:update    # Update baseline PNGs
```

After UI changes: run `test:screenshots:update`, then inspect every updated PNG in `e2e/visual.spec.ts-snapshots/` before committing.

---

## Code Layout

```
src/
├── app/
│   ├── api/            # Next.js API Routes (one folder per endpoint group)
│   └── */              # Page components (App Router)
├── components/         # React UI components
│   ├── editor/         # Tiptap extensions
│   ├── focus-mode/     # Focus mode panels
│   ├── timeline/       # Timeline view
│   └── ui/             # Shadcn/ui primitives
├── lib/
│   ├── ai/             # In-app chat tool registry + executor
│   ├── controllers/    # Business logic (called by API routes and AI tools)
│   ├── export/         # Google Docs exporter
│   ├── api-auth.ts     # Request authentication helpers
│   ├── auth.ts         # Session/token management
│   ├── db.ts           # Prisma client singleton
│   ├── env.ts          # Validated env vars (Zod)
│   ├── logger.ts       # Structured logger (pino-compatible)
│   └── types.ts        # Shared TypeScript types
├── mcp/
│   ├── index.ts        # MCP server entrypoint
│   ├── tools/          # Tool implementations by category
│   └── skills.ts       # Writing skill loader (MCP Prompts)
└── __tests__/          # Vitest unit tests
```

---

## Adding an API Endpoint

1. Create `src/app/api/<route>/route.ts`
2. Import `verifyRequest` (or `verifyProjectAccess`) from `@/lib/api-auth` for auth
3. Validate input with Zod — share schemas with the controller where possible
4. Delegate business logic to a **controller** in `src/lib/controllers/`
5. Write tests in `src/__tests__/` (Vitest)
6. Update `docs/API.md` with the new endpoint

Pattern:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyRequest } from "@/lib/api-auth";
import { MyController } from "@/lib/controllers/my-controller";

const BodySchema = z.object({ name: z.string() });

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (!auth.ok) return auth.response;

  const body = BodySchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error }, { status: 400 });

  const result = await MyController.doSomething(body.data);
  return NextResponse.json(result, { status: 201 });
}
```

---

## Adding a Controller

Controllers live in `src/lib/controllers/` and contain all business logic. They use the Prisma client from `src/lib/db.ts` directly.

- Keep controllers free of HTTP concerns (no `NextRequest`, no response objects)
- Return plain objects or throw `Error` on failure
- Use `autoSnapshot()` from `src/lib/db.ts` before any write that an agent might trigger

---

## Adding an MCP Tool

1. Add the implementation function to the appropriate file in `src/mcp/tools/`
2. Register the tool in `src/mcp/index.ts` via `server.tool(name, schema, handler)`
3. Use the same Zod schema as the corresponding controller method where possible
4. Update tool count in `docs/ARCHITECTURE.md` if registering a new tool

The MCP server uses `@modelcontextprotocol/sdk`. Tools are registered with Zod input schemas; the SDK handles JSON-Schema conversion.

For destructive tools: check `process.env.MCP_ALLOW_DESTRUCTIVE` before registering:

```typescript
if (process.env.MCP_ALLOW_DESTRUCTIVE === "true") {
  server.tool("delete_thing", schema, handler);
}
```

---

## Testing

### Unit Tests (Vitest)

Tests live in `src/__tests__/`. Each API handler, controller, and non-trivial utility should have a test file.

```bash
docker compose exec app npm run test:run            # All tests
docker compose exec app npm run test:run -- cache   # Filter by name
```

Test setup: `src/__tests__/globalSetup.ts` — creates a fresh in-memory SQLite DB for each run.

**Never mock the database** — tests use a real SQLite DB seeded per test. This is intentional to catch schema/query issues that mocks would hide.

### TypeScript

```bash
docker compose exec app npm run typecheck
```

Errors block CI. Fix them before committing.

### Lint

```bash
docker compose exec app npm run lint
```

The project uses ESLint with Next.js defaults. Auto-fix: `npm run lint -- --fix`.

---

## Schema Changes

**NEVER run `prisma db push` or `prisma migrate reset` on a database with real data.**

Safe procedure:

```bash
# 1. Write migration SQL
cat > migration.sql << 'EOF'
ALTER TABLE "SomeTable" ADD COLUMN "newColumn" TEXT;
EOF

# 2. Apply to running DB
docker compose exec app sqlite3 data/word-coach-annie.db < migration.sql

# 3. Update prisma/schema.prisma to match

# 4. Regenerate client (does NOT touch the DB)
docker compose exec app npx prisma generate
```

---

## Environment Variables

See [SETUP.md](SETUP.md) for the full reference. For local dev, copy `.env.example` to `.env.local`.

The `src/lib/env.ts` module validates environment variables at startup with Zod — add new variables there when introducing new configuration.

---

## CI/CD

GitHub Actions runs on every push:

1. **Quality gates** (parallel): typecheck → lint → build → test with coverage
2. **Security audit**: `npm audit --audit-level=high` — fails on new high/critical advisories not in `.audit-allowlist` (known unfixable `@google/adk` transitive vulns are pre-allowlisted)
3. **Deploy** (main only, after gates): SSH via Tailscale to pull latest image

Branch protection on `main` requires all gates to pass. The deploy job uses `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, and `TAILSCALE_AUTH_KEY` secrets.

A separate **scheduled workflow** (`supabase-disk-monitor.yml`) checks Supabase disk usage every 6 hours and opens a GitHub Issue if usage exceeds 70% of the 500 MB free-tier quota. It requires two additional repository secrets: `ANNIE_DATABASE_URL` and `RELI_DATABASE_URL` (direct-port psql URLs — see `.env.example` for format).


**Dependabot** opens weekly PRs for npm dependency updates (label: `dependencies`, prefix: `chore(deps)`). When upstream ships a fix for allowlisted advisories, remove the corresponding entries from `.audit-allowlist`.

---

## Bundle Analysis

```bash
docker compose exec app npm run analyze
```

Runs `next build` with `@next/bundle-analyzer` and opens an interactive bundle map. Use this before shipping large dependency additions.

---

## AI Tool Registry (In-App Chat)

The in-app AI chat (`POST /api/chat`) loads tools from `src/lib/ai/tool-registry.ts` in two tiers:

- **Tier 1** (~8 tools): always loaded — project summary, outline, read/write scenes, story objects, relationships
- **Tier 2** (remaining tools): loaded on demand via a `load_toolset` meta-tool when the AI needs more capability

When adding a tool to the in-app chat:
1. Define the Zod schema in `tool-registry.ts`
2. Add the handler in `tool-executor.ts`
3. Assign it to the correct toolset (tier 1 vs 2)

This two-tier approach saves ~81% token overhead vs loading all tools upfront.

---

## Observability

- **Logging**: `import { logger } from "@/lib/logger"` — structured, pino-compatible
- **Error tracking**: Sentry configured in `sentry.{client,server,edge}.config.ts`
- **Tracing**: OpenTelemetry in `src/instrumentation.ts` — spans on MCP tool calls and AI chat
- **Health**: `GET /api/health` → `{"ok":true}`

---

## Contributing

1. Branch from `main`
2. Run quality gates locally before pushing: typecheck → lint → test
3. PRs must reference a GitHub issue (`Fixes #N` or `Part of #N`) — see [CLAUDE.md](../CLAUDE.md)
4. Screenshot tests: run `test:screenshots`, inspect every PNG, commit updated baselines alongside code
5. Update relevant `docs/` files when adding features or changing behavior
