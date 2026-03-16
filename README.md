# Word Coach Annie

A local-first, AI-powered writing assistant for novelists and article writers. Manage complex narratives — structure, characters, world-building, timelines — and export clean Markdown or sync to Google Docs.

## Features

### Writing
- **Hierarchical structure**: Parts → Chapters → Scenes with status tracking (Outline/Draft/Revised/Final)
- **Rich text editor**: Tiptap-based WYSIWYG with auto-save, word counts, and content versioning
- **Scene beats**: Inline narrative waypoints (`<!-- beat: ... -->`) rendered as styled cards, stripped on export
- **Focus mode**: Distraction-free three-panel layout (scene info | editor | related elements)
- **Full-text search**: Search across all scenes and story objects with highlighted snippets
- **Keyboard shortcuts**: Cmd/Ctrl+K search, Escape close, Cmd+/ sidebar toggle

### Story Management
- **Story objects**: Characters, Locations, Plotlines, World Elements, Notes — all with CRUD and tags
- **Relationships**: Typed links between any entities (APPEARS_IN, LOCATED_AT, PART_OF_PLOTLINE, etc.)
- **Story graph**: Interactive visual graph of entity relationships within a project
- **Universes**: Shared world-building containers spanning multiple projects
- **World objects**: Universe-scoped characters, locations, elements with ordered timeline entries
- **Timeline view**: Visual matrix of story objects × scenes showing where characters/locations appear

### Export
- **Markdown**: Full manuscript, per-chapter, or story bible with configurable options
- **Medium**: Medium-ready Markdown with front matter
- **Google Docs**: OAuth-based export with idempotent sync (3 modes: Universe, Internal, Reader)

### AI Integration
- **AI chat panel**: Per-project streaming chat with full story context (characters, outline, current scene)
- **BYO API key**: Per-user AI settings — bring your own OpenAI-compatible API key and model
- **MCP server**: 48 tools for agentic access to all project data (read/write scenes, manage characters, export, etc.)
- **Writing skills**: 6 curated MCP Prompts — developmental edit, line edit, consistency check, plot structure analysis, character arc review, scene drafting assistant
- **First-run setup wizard**: Guided API key configuration and feature tour for new users

### Article / Non-Fiction
- **Project types**: FICTION, ARTICLE_COLLECTION, GENERAL with dynamic UI labels (Chapter→Article, Scene→Section, etc.)
- **Medium export**: Article-optimized Markdown with front matter

### Platform
- **Google OAuth login**: Authentication with JWT session management
- **Per-user rate limiting**: API endpoint protection against abuse
- **Offline support**: Service worker caching, IndexedDB storage, and mutation queue with auto-replay on reconnect
- **Dark mode**: Toggle with system preference detection
- **Accessibility**: ARIA labels and keyboard navigation throughout
- **Error handling**: Error boundaries, graceful 404/500 pages, toast notifications
- **Loading states**: Skeleton screens for lists, chat panel, and scene editor
- **Feedback channel**: In-app feedback dialog with GitHub issue creation

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser                         │
│                                                     │
│  Next.js App Router (React 19 + Shadcn/ui)          │
│  ┌──────────┐ ┌──────────┐ ┌────────────────────┐   │
│  │ Dashboard │ │ Editor   │ │ Focus / Timeline   │   │
│  │          │ │ (Tiptap) │ │ / Graph views      │   │
│  └──────────┘ └──────────┘ └────────────────────┘   │
│  Service Worker (offline caching + sync queue)       │
└─────────────────┬───────────────────────────────────┘
                  │ REST API
┌─────────────────▼───────────────────────────────────┐
│              Next.js API Routes                      │
│                                                     │
│  Auth middleware (Google OAuth + JWT)                 │
│  Rate limiting middleware (per-user)                  │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐   │
│  │ Controllers  │ │ AI Chat     │ │ Google Docs  │   │
│  │ (6 modules)  │ │ (streaming) │ │ Export/Sync  │   │
│  └──────┬──────┘ └──────┬──────┘ └──────┬───────┘   │
│         │               │               │           │
│  ┌──────▼───────────────▼───────────────▼───────┐   │
│  │          Prisma ORM (11 models)               │   │
│  │          SQLite database                      │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              MCP Server (stdio)                      │
│  48 tools + 6 writing skills as MCP Prompts          │
│  Connects via: docker compose exec -T app npx tsx    │
└─────────────────────────────────────────────────────┘
```

**Data flow**: The browser communicates with Next.js API routes over REST. All routes are gated by authentication and rate limiting middleware. Controllers handle business logic and interact with SQLite through Prisma. The AI chat streams responses from any OpenAI-compatible provider. The MCP server exposes the same data layer to AI agents via stdio transport.

**Key design decisions**:
- **Local-first**: SQLite database stored on disk, no cloud dependency required
- **Docker-contained**: Entire app runs in a single container for simple deployment
- **Offline-capable**: Service worker caches API responses; IndexedDB queues mutations for replay on reconnect
- **Multi-tenant**: Google OAuth with per-user data scoping across all API routes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict mode) |
| Frontend | React 19, Shadcn/ui, Tailwind CSS, Tiptap 3 |
| Database | SQLite via Prisma 6 (11 models) |
| Auth | Google OAuth + JWT sessions |
| AI | OpenAI SDK → configurable provider (default: Gemini 2.0 Flash) |
| MCP | @modelcontextprotocol/sdk 1.12 (stdio transport) |
| Testing | Vitest + @vitest/coverage-v8, Playwright (E2E) |
| Container | Docker + Docker Compose |
| Security | Encrypted API keys at rest, XSS protection (DOMPurify), input sanitization |

## Getting Started

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/)

### Quick Start

```bash
git clone https://github.com/alexsiri7/annie.git
cd annie
cp .env.example .env   # Configure API keys
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000). A setup wizard will guide you through API key configuration on first launch.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_API_BASE_URL` | For AI chat | OpenAI-compatible API base URL (e.g. `https://api.openai.com/v1`) |
| `AI_API_KEY` | For AI chat | API key for your AI provider |
| `AI_MODEL` | No | Model name (default: `gpt-4o`) |
| `GOOGLE_CLIENT_ID` | For login & Google Docs | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For login & Google Docs | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | For Google Docs | OAuth callback URL |
| `CLOUDFLARE_TUNNEL_TOKEN` | No | Cloudflare Tunnel for public access |

## MCP Server (for AI Agents)

Annie includes a Model Context Protocol server with 48 tools for full read/write access to project data.

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "word-coach-annie": {
      "command": "docker",
      "args": ["compose", "exec", "-T", "app", "npx", "tsx", "src/mcp/index.ts"]
    }
  }
}
```

The `-T` flag disables pseudo-tty allocation for clean stdio communication.

### Tool Categories

| Category | Tools | Examples |
|----------|-------|---------|
| Projects | 4 | list, get, create, update |
| Structure | 10 | outline, create/update/delete nodes, scene content, versions, annotations |
| Story Objects | 5 | list, get, create, update, delete |
| Relationships | 3 | list, create, delete |
| Universes | 14 | CRUD for universes, world objects, timeline entries |
| Export | 4 | manuscript, story bible, medium, Google Docs |
| Database Safety | 3 | snapshot, list snapshots, restore |
| Google Auth | 4 | status, connect, callback, disconnect |
| Skills | 1 | list available writing skills |

### Writing Skills (MCP Prompts)

Six curated instruction sets registered as MCP Prompts:
- **Developmental Edit** — structural/story-level feedback
- **Line Edit** — sentence-level clarity, voice, word choice
- **Consistency Check** — cross-reference world elements for contradictions
- **Plot Structure Analysis** — analyze against frameworks (3-act, hero's journey, etc.)
- **Character Arc Review** — map arcs, identify flat characters
- **Scene Drafting Assistant** — draft scenes from outline context

## Development

```bash
docker compose up              # Start with logs
docker compose exec app npm run test:run     # Run tests
docker compose exec app npm run typecheck    # TypeScript check
docker compose exec app npm run lint         # ESLint
docker compose exec app npm run build        # Production build
docker compose exec app npx prisma studio    # Database browser (port 5555)
```

### Database Safety

**NEVER run `prisma db push` or `prisma migrate reset` on the production database.** These can drop and recreate tables, destroying all data.

For schema changes:
1. Write migration SQL by hand (`ALTER TABLE ... ADD COLUMN ...`)
2. Apply: `sqlite3 data/word-coach-annie.db < migration.sql`
3. Update `prisma/schema.prisma` to match
4. Run `npx prisma generate` (client only, safe)

### Project Structure

```
src/
├── app/                    # Next.js App Router (pages + API routes)
│   ├── api/                # REST endpoints (16 route groups)
│   ├── login/              # Authentication page
│   ├── project/[id]/       # Editor, settings, timeline, focus mode, graph
│   └── universe/           # Universe management
├── components/             # React UI components
│   ├── editor/             # Tiptap extensions (beats, links)
│   ├── focus-mode/         # Focus mode panels
│   ├── timeline/           # Timeline view
│   ├── ui/                 # Shadcn/ui primitives
│   ├── ai-chat-panel.tsx   # Streaming AI chat
│   ├── story-graph.tsx     # Interactive relationship graph
│   └── setup-wizard.tsx    # First-run configuration
├── lib/
│   ├── controllers/        # Business logic (6 controllers)
│   ├── export/             # Google Docs exporter
│   ├── env.ts              # Zod-validated environment config
│   └── db.ts               # Prisma client singleton
├── mcp/
│   ├── index.ts            # MCP server (48 tools)
│   ├── tools/              # Tool implementations by category
│   └── skills.ts           # Skill loader
└── __tests__/              # Test files (Vitest)
```

## Documentation

- [Requirements](docs/REQUIREMENTS.md) — Functional requirements and data model
- [Future Requirements](docs/FUTURE_REQUIREMENTS.md) — Planned features (cloud, collaboration)
- [Tech Stack](docs/TECH_STACK.md) — Architecture and technology details
- [Decision Log](docs/memory-bank/decisionLog.md) — Why we made the choices we did
- [Progress](docs/memory-bank/progress.md) — Completed milestones and open work
