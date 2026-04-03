# Annie (Word Coach) Tech Stack

## Architecture Overview

Annie is a full-stack writing tool built on Next.js with a rich text editor,
hierarchical story structure, world-building tools, and AI chat integration.

```
┌─────────────────────────────────────────────┐
│              Next.js 15 (App Router)        │
│  ┌──────────────────┐  ┌─────────────────┐ │
│  │  React 19 SPA    │  │  API Routes     │ │
│  │  Tiptap Editor   │  │  (/api/*)       │ │
│  │  Shadcn/ui       │  │  Prisma ORM     │ │
│  └──────────────────┘  └─────────────────┘ │
│                              │              │
│                         ┌────┴────┐         │
│                         │ Postgres│         │
│                         │(Supabase│         │
│                         └─────────┘         │
└─────────────────────────────────────────────┘
         │                          │
      Railway                    OpenAI
      (hosting)              (AI, configurable)
```

## Backend

| Component | Technology | Details |
|-----------|-----------|---------|
| Framework | Next.js 15.2.1 | App Router, API routes |
| Runtime | Node.js 20 | Docker base: `node:20-slim` |
| Language | TypeScript 5.7.3 | Strict mode |
| ORM | Prisma 7.6.0 | Type-safe DB access with `@prisma/adapter-pg` |
| Database | PostgreSQL 16 | Via Supabase (connection pooler, port 6543) |
| Validation | Zod 3.24.2 | Schema validation |
| AI | OpenAI SDK | Chat completions (configurable provider) |
| Google APIs | googleapis | Google Docs export, Drive |
| OAuth | google-auth-library | Google authentication |
| MCP | @modelcontextprotocol/sdk | AI tool integration server |

### Database Schema (Prisma)

Core models for hierarchical story structure:

| Model | Purpose |
|-------|---------|
| Project | Top-level story/article container |
| StructureNode | Hierarchical nodes (acts, chapters, scenes) |
| ContentVersion | Versioned scene content with word counts |
| StoryObject | Characters, items, locations within a project |
| Universe | Shared world across projects |
| WorldObject | Characters, locations, world elements (universe-level) |
| Relationship | Typed connections between any entities |
| Annotation | Inline comments on scenes |
| ChatMessage | AI chat history per project |
| GoogleDocExport | Export tracking for Google Docs sync |
| GoogleCredential | OAuth token storage |
| MediumCredential | Medium API token storage |
| MediumExport | Medium publish tracking |
| WorldObjectTimelineEntry | Timeline events for world objects |

## Frontend

| Component | Technology | Details |
|-----------|-----------|---------|
| Framework | React 19.0 | Latest React with App Router |
| UI Library | Shadcn/ui | Built on Radix UI primitives |
| Rich Text Editor | Tiptap 3.19 | Extensible editor (bubble menu, highlight, placeholder) |
| Icons | Lucide React | Icon library |
| Styling | Tailwind CSS 3.4 | With tailwind-animate, tailwind-merge, CVA |
| XSS Protection | DOMPurify | HTML sanitization |
| State | React hooks | No external state library |
| PWA | next-pwa | Runtime caching for API routes, Google Fonts |

### Key UI Features
- Hierarchical outline tree (acts → chapters → scenes)
- Rich text scene editor with beat annotations
- Focus mode for distraction-free writing
- World-building panels (characters, locations, timelines)
- AI chat panel per project
- Google Docs export
- Medium publishing (draft/public/unlisted)
- Search across scenes and story objects
- Mobile-responsive layout

## Infrastructure

### Hosting

| Environment | URL | Platform |
|-------------|-----|----------|
| Production | `annie.interstellarai.net` | Railway |
| Staging | `word-coach-annie-staging.up.railway.app` | Railway |
| Database | Supabase PostgreSQL | Port 6543 (transaction pooler) |

### Docker

Three-stage multi-stage build (`Dockerfile`):

1. **deps** — Install npm dependencies, generate Prisma client
2. **builder** — Build Next.js with `output: "standalone"`
3. **runner** — Node 20-slim with standalone build + Prisma + migrations

The container runs migrations on startup (`node scripts/migrate.mjs`)
then starts the app (`node server.js`). The migration runner refuses
destructive DDL (DROP/TRUNCATE) if the database has live data.

Docker Compose adds:
- **Phoenix** (arizephoenix/phoenix:6006) — OpenTelemetry tracing
- **Cloudflare Tunnel** — Public access for local dev

### CI/CD (GitHub Actions)

```
Push/PR → CI (ci.yml)
  ├─ Lint & Typecheck (ESLint + tsc)
  ├─ Unit Tests (Vitest + PostgreSQL 16)
  ├─ E2E Integration Tests (Playwright)
  └─ Docker Build validation

CI passes on main → Staging → Production Pipeline (staging-smoke.yml)
  ├─ Staging E2E Tests (Playwright against staging)
  ├─ Deploy to Production (promote staging image via Railway GraphQL API)
  ├─ Production Health Check (poll /api/health, max 10 min)
  └─ Rollback (auto-rollback via Railway API + GitHub issue if unhealthy)

Every 5 min → Uptime Monitor (uptime.yml)
  ├─ Production Health Check (annie.interstellarai.net/api/health)
  └─ Staging Health Check (word-coach-annie-staging.up.railway.app/api/health)
```

**Deploy pipeline:** Staging must have a successful deployment. The pipeline
fetches the staging image via Railway's GraphQL API and deploys it to
production. Requires `RAILWAY_TOKEN`, `RAILWAY_STAGING_SERVICE_ID`,
`RAILWAY_STAGING_ENVIRONMENT_ID`, `RAILWAY_PRODUCTION_SERVICE_ID` as
GitHub Actions secrets.

### Testing

| Tool | Purpose |
|------|---------|
| Vitest | Unit + integration tests (against PostgreSQL 16) |
| @vitest/coverage-v8 | Coverage reporting |
| Playwright | E2E and visual regression tests |
| ESLint | Linting with @typescript-eslint |

Visual regression screenshots live in `e2e/visual.spec.ts-snapshots/`.

### Code Quality
- **ESLint**: Modern flat config (eslint.config.mjs)
- **TypeScript**: Strict mode enabled
- **Branch protection**: main requires CI check

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection (Supabase, port 6543) | Yes |
| `GOOGLE_CLIENT_ID` | OAuth for Docs export | No |
| `GOOGLE_CLIENT_SECRET` | OAuth secret | No |
| `GOOGLE_REDIRECT_URI` | OAuth callback | No |
| `AI_API_BASE_URL` | LLM provider endpoint | No |
| `AI_API_KEY` | LLM API key | No |
| `AI_MODEL` | LLM model name | No |
| `ALLOWED_EMAILS` | Access control (comma-separated) | No |
| `API_TOKEN` | Request authentication (32-byte hex) | Recommended |
| `JWT_SECRET` | OAuth session signing | No |
| `ENCRYPTION_KEY` | Data-at-rest encryption | No |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Error tracking | No |
| `RAILWAY_TOKEN` | Railway API (for deploy pipeline) | CI only |
| `RAILWAY_STAGING_SERVICE_ID` | Staging service ID | CI only |
| `RAILWAY_STAGING_ENVIRONMENT_ID` | Staging environment ID | CI only |
| `RAILWAY_PRODUCTION_SERVICE_ID` | Production service ID | CI only |

See `.env.example` for the full list.

## External Services

| Service | Purpose | Auth |
|---------|---------|------|
| Supabase PostgreSQL | Production database | Connection string |
| Railway | Hosting (staging + production) | API token |
| AI Provider | OpenAI-compatible LLM (configurable) | API key |
| Google Docs/Drive | Document export & sync | OAuth2 |
| Medium | Story publishing | Self-issued integration token |
| Sentry | Error tracking | Auth token |
| Cloudflare Tunnel | Local dev public access | Tunnel token |
| Phoenix | OpenTelemetry tracing (local) | N/A |

## Database Safety Rules

**NEVER run `prisma db push` or `prisma migrate reset` on production.**

For schema changes, use Prisma migrations:
1. Create migration: `npx prisma migrate dev --name <description>`
2. The migration runner (`scripts/migrate.mjs`) applies pending migrations on container start
3. The runner refuses destructive DDL (DROP/TRUNCATE) if the database has data
4. Run `npx prisma generate` to regenerate the client after schema changes
