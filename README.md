# Word Coach Annie

A local-first, AI-powered writing assistant for novelists and article writers. Manage complex narratives — structure, characters, world-building, timelines — and export clean Markdown or sync to Google Docs.

## Features

### Writing
- **Hierarchical structure**: Parts → Chapters → Scenes with status tracking (Outline/Draft/Revised/Final)
- **Rich text editor**: Tiptap-based WYSIWYG with auto-save, word counts, and content versioning
- **Scene beats**: Inline narrative waypoints (`<!-- beat: ... -->`) rendered as styled cards, stripped on export
- **Focus mode**: Distraction-free three-panel layout (scene info | editor | related elements)
- **Full-text search**: Search across all scenes and story objects with highlighted snippets

### Story Management
- **Story objects**: Characters, Locations, Plotlines, World Elements, Notes — all with CRUD and tags
- **Relationships**: Typed links between any entities (APPEARS_IN, LOCATED_AT, PART_OF_PLOTLINE, etc.)
- **Universes**: Shared world-building containers spanning multiple projects
- **World objects**: Universe-scoped characters, locations, elements with ordered timeline entries
- **Timeline view**: Visual matrix of story objects × scenes showing where characters/locations appear

### Export
- **Markdown**: Full manuscript, per-chapter, or story bible with configurable options
- **PDF**: Server-rendered PDF download via `@react-pdf/renderer`
- **EPUB**: EPUB 3 download via `epub-gen-memory`, beat annotations stripped automatically
- **Medium**: Medium-ready Markdown with front matter
- **Google Docs**: OAuth-based export with idempotent sync (3 modes: Universe, Internal, Reader)

### AI Integration
- **AI chat panel**: Per-project streaming chat with full story context (characters, outline, current scene)
- **MCP server**: 71 tools for agentic access to all project data (read/write scenes, manage characters, export, etc.)
- **Writing skills**: 6 curated MCP Prompts — developmental edit, line edit, consistency check, plot structure analysis, character arc review, scene drafting assistant

### Article / Non-Fiction
- **Project types**: FICTION, ARTICLE_COLLECTION, GENERAL with dynamic UI labels (Chapter→Article, Scene→Section, etc.)
- **Medium export**: Article-optimized Markdown with front matter

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict mode) |
| Frontend | React 19, Shadcn/ui, Tailwind CSS, Tiptap 3 |
| Database | PostgreSQL (Supabase) via Prisma 6 |
| AI | Google AI + @google/adk (Gemini 2.0 Flash) |
| MCP | @modelcontextprotocol/sdk 1.12 (stdio transport) |
| Testing | Vitest + @vitest/coverage-v8 |
| Container | Docker + Docker Compose |

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

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string (Supabase or local PG) |
| `GEMINI_API_KEY` | For AI chat | Google AI API key (can also configure in Settings UI) |
| `AI_MODEL` | No | Gemini model name (default: `gemini-2.0-flash-001`) |
| `GOOGLE_CLIENT_ID` | For Google Docs | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For Google Docs | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | For Google Docs | OAuth callback URL |
| `API_TOKEN` | Recommended | Bearer token for API/MCP access (32-byte hex) |
| `JWT_SECRET` | No | JWT signing secret for Google OAuth sessions |
| `ENCRYPTION_KEY` | No | Key for encrypting API keys at rest |
| `ALLOWED_EMAILS` | No | Comma-separated list of allowed Google accounts |
| `CLOUDFLARE_TUNNEL_TOKEN` | No | Cloudflare Tunnel for public access |

## MCP Server (for AI Agents)

Annie includes a Model Context Protocol server with 71 tools for full read/write access to project data.

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
| Projects | 8 | list, get, create, update, link/unlink to universe, transfer story objects |
| Structure | 12 | outline, create/update/delete nodes, scene content, versions, batch operations |
| Annotations | 5 | add, update, delete, resolve, get open annotations |
| Story Objects | 8 | list, get, create, update, delete + batch create/update/delete |
| Relationships | 3 | list, create, delete |
| Universes | 14 | CRUD for universes, world objects, timeline entries, reorder |
| Export | 5 | manuscript, story bible, Hashnode, Google Docs, project summary |
| Database Safety | 3 | snapshot, list snapshots, restore |
| Google Auth | 5 | status, connect, callback, disconnect, export to Google Docs |
| Coaching & Analysis | 6 | plot thread status, scene focus, manuscript context, consistency, story bible cross-reference, voice context |
| Skills | 1 | list available writing skills |

### Writing Skills (MCP Prompts)

Eight curated instruction sets registered as MCP Prompts, plus 5 built-in coaching prompts:

**Skills** (from `.skills/`):
- **Developmental Edit** — structural/story-level feedback
- **Line Edit** — sentence-level clarity, voice, word choice
- **Consistency Check** — cross-reference world elements for contradictions
- **Plot Structure Analysis** — analyze against frameworks (3-act, hero's journey, etc.)
- **Character Arc Review** — map arcs, identify flat characters
- **Scene Drafting Assistant** — draft scenes from outline context
- **Outline Review** — review scene outlines before drafting
- **Story Development Chat** — open-ended story development conversation

**Built-in Prompts**:
- **review** — status-aware routing (OUTLINE→outline review, DRAFT→dev edit, REVISED→line edit, FINAL→consistency)
- **scene-coaching** — status-adaptive coaching for a single scene
- **inline-edit** — inline text operations (rewrite, continue, expand, voice-check)
- **manuscript-analysis** — project-level analysis (plot threads, character arcs, consistency)
- **plan_beats** — map a scene as structured BEAT blocks; Annie provides the blueprint, writer fills the prose

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
1. Create migration: `docker compose exec app npx prisma migrate dev --name <description>`
2. The migration runner (`scripts/migrate.mjs`) applies it on container start
3. Run `npx prisma generate` to regenerate the client

### Project Structure

```
src/
├── app/                    # Next.js App Router (pages + API routes)
│   ├── api/                # 27 REST endpoints
│   ├── project/[id]/       # Editor, settings, timeline, focus mode
│   └── universe/           # Universe management
├── components/             # React UI components
│   ├── editor/             # Tiptap extensions (beats, links)
│   ├── focus-mode/         # Focus mode panels
│   ├── timeline/           # Timeline view
│   └── ui/                 # Shadcn/ui primitives
├── lib/
│   ├── controllers/        # Business logic (6 controllers)
│   ├── export/             # Google Docs exporter
│   └── db.ts               # Prisma client singleton
├── mcp/
│   ├── index.ts            # MCP server (71 tools)
│   ├── tools/              # Tool implementations by category
│   └── skills.ts           # Skill loader
└── __tests__/              # 12 test files, 69+ tests
```

## Documentation

- [Requirements](docs/REQUIREMENTS.md) — Functional requirements and data model
- [Future Requirements](docs/FUTURE_REQUIREMENTS.md) — Planned features (cloud, collaboration)
- [Tech Stack](docs/TECH_STACK.md) — Architecture and technology details
- [Decision Log](docs/memory-bank/decisionLog.md) — Why we made the choices we did
- [Progress](docs/memory-bank/progress.md) — Completed milestones and open work
