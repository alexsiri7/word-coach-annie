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
│                         │ SQLite  │         │
│                         └─────────┘         │
└─────────────────────────────────────────────┘
         │                          │
    Cloudflare                   OpenAI
    Tunnel                       (chat)
```

## Backend

| Component | Technology | Details |
|-----------|-----------|---------|
| Framework | Next.js 15.2.1 | App Router, API routes |
| Runtime | Node.js 20 | Docker base: `node:20-slim` |
| Language | TypeScript 5.7.3 | Strict mode |
| ORM | Prisma 6.4.1 | Type-safe database access |
| Database | SQLite | At `./data/word-coach-annie.db` (volume-mounted) |
| Validation | Zod 3.24.2 | Schema validation |
| AI | OpenAI SDK 6.29 | Chat completions via Requesty gateway → Gemini 2.0 Flash |
| Google APIs | googleapis 171.4 | Google Docs export, Drive |
| OAuth | google-auth-library 10.5 | Google authentication |
| MCP | @modelcontextprotocol/sdk 1.12 | AI tool integration server |

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
| WorldObjectTimelineEntry | Timeline events for world objects |

## Frontend

| Component | Technology | Details |
|-----------|-----------|---------|
| Framework | React 19.0 | Latest React with App Router |
| UI Library | Shadcn/ui | Built on Radix UI primitives |
| Rich Text Editor | Tiptap 3.19 | Extensible editor (bubble menu, highlight, placeholder) |
| Icons | Lucide React 0.564 | Icon library |
| Styling | Tailwind CSS 3.4 | With tailwind-animate, tailwind-merge, CVA |
| XSS Protection | DOMPurify 3.3 | HTML sanitization |
| State | React hooks | No external state library |

### Key UI Features
- Hierarchical outline tree (acts → chapters → scenes)
- Rich text scene editor with beat annotations
- Focus mode for distraction-free writing
- World-building panels (characters, locations, timelines)
- AI chat panel per project
- Google Docs export
- Search across scenes and story objects
- Mobile-responsive layout

## Infrastructure

### Containerization
- **Docker** — Node 20 slim base
- **Docker Compose** — App service + Cloudflare tunnel
- **Volumes**: Source code mounted for hot reload; `./data` for SQLite
- **Port**: `127.0.0.1:3000` (local only, tunneled via Cloudflare)

### CI/CD (GitHub Actions)
```
Quality Gates (Node 20):
  1. npm ci
  2. Typecheck (tsc --noEmit)
  3. Lint (ESLint)
  4. Build (next build, NODE_OPTIONS=--max-old-space-size=4096)
  5. Test with coverage (vitest + @vitest/coverage-v8)

Deploy:
  1. Tailscale VPN connect
  2. SSH to 100.120.193.82
  3. git pull + npm ci + npm run build + docker compose up
```

### Testing

| Tool | Purpose |
|------|---------|
| Vitest 3.0.7 | Unit + integration tests |
| @vitest/coverage-v8 3.2.4 | Coverage reporting (threshold: 1%, raising incrementally) |
| ESLint 8.57 | Linting with @typescript-eslint |

**Test coverage**: 10 test files, 80 tests. Covers controllers, API data layer,
content versioning, beats parsing, export, story objects, structure, universes.
No component tests or e2e tests yet (Playwright visual tests in progress).

### Code Quality
- **ESLint**: Modern flat config (eslint.config.mjs)
- **TypeScript**: Strict mode enabled
- **Branch protection**: master requires Quality Gates check

### Networking
- **Cloudflare Tunnel** — Public access via tunnel token in docker-compose
- **Tailscale VPN** — CI deploy access to internal IP

### Planned: Docker Registry Deploy (an-yoz)
- Build image in CI → push to ghcr.io → pull on server
- Tagged with commit SHA for instant rollback
- Server never builds — what CI tests is what deploys

## External Services

| Service | Purpose | Auth |
|---------|---------|------|
| Requesty | LLM gateway (routes to Gemini 2.0 Flash) | API key (`REQUESTY_API_KEY`) |
| Google Docs/Drive | Document export & sync | OAuth2 (`GOOGLE_CLIENT_ID/SECRET`) |
| Cloudflare | Tunnel for public access | Tunnel token |
| Tailscale | VPN for CI deploy | Auth key |

## Database Safety Rules

**NEVER run `prisma db push` or `prisma migrate reset` on the production database.**
These can drop and recreate SQLite tables, destroying all data. See CLAUDE.md.

For schema changes:
1. Write migration SQL by hand (`ALTER TABLE ... ADD COLUMN ...`)
2. Apply: `sqlite3 data/word-coach-annie.db < migration.sql`
3. Update `prisma/schema.prisma` to match
4. Run `npx prisma generate` (client only, safe)

## Backup Strategy

- **Git versioned**: `data/.git` tracks database snapshots
- **Local**: Every 6 hours to `/mnt/steam-fast/backups/annie/` (7-day rotation)
- **Cloud**: Synced to Google Drive via rclone (`gdrive:backups/gas-town/annie/`)
- **Script**: `/home/asiri/gt/mayor/scripts/backup-dbs.sh`
