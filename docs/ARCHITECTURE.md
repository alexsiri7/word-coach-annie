# Architecture

Word Coach Annie is a full-stack Next.js 15 application with a rich text editor,
hierarchical story structure, world-building tools, and AI chat. This document covers
the system architecture, data model, and key subsystems.

## High-Level Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Next.js 15 App                           │
│                                                                  │
│  ┌──────────────────────┐    ┌───────────────────────────────┐  │
│  │    React 19 SPA      │    │        API Routes (/api/*)    │  │
│  │  Tiptap Editor       │    │        Zod validation         │  │
│  │  Shadcn/ui           │◄──►│        Prisma ORM             │  │
│  │  Tailwind CSS        │    │        Controllers            │  │
│  └──────────────────────┘    └───────────────┬───────────────┘  │
│                                              │                   │
│                                    ┌─────────▼────────┐         │
│                                    │   SQLite DB      │         │
│                                    │ (volume-mounted) │         │
│                                    └──────────────────┘         │
└──────────────────────────────────────────────────────────────────┘
              │                                  │
     Cloudflare Tunnel                    MCP Server (stdio)
     (public access)                  External agents (Claude, Gemini)
```

## Directory Structure

```
src/
├── app/                        # Next.js App Router
│   ├── api/                    # REST API endpoints
│   │   ├── ai-settings/        # AI provider configuration
│   │   ├── annotations/        # Scene annotations (inline comments)
│   │   ├── auth/               # Authentication (login, Google OAuth)
│   │   ├── chat/               # Streaming AI chat
│   │   ├── conversations/      # Chat thread CRUD
│   │   ├── feedback/           # GitHub issue feedback
│   │   ├── focus/              # Focus mode scene context
│   │   ├── health/             # Health check
│   │   ├── mcp/                # HTTP MCP proxy endpoint
│   │   ├── nodes/              # Structure node CRUD + content versioning
│   │   ├── projects/           # Project CRUD, outline, search, export
│   │   ├── relationships/      # Entity relationship management
│   │   ├── setup-status/       # First-run setup check
│   │   ├── story-objects/      # Character/location/plotline CRUD
│   │   ├── timeline/           # Timeline view data
│   │   ├── universes/          # Universe + world object management
│   │   └── world-objects/      # World object CRUD
│   ├── login/                  # Login page
│   ├── project/[id]/           # Project editor, focus mode, timeline
│   └── universe/               # Universe management pages
├── components/                 # React components
│   ├── editor/                 # Tiptap extensions (beats, links, highlight)
│   ├── focus-mode/             # Focus mode panels
│   ├── timeline/               # Timeline view
│   └── ui/                     # Shadcn/ui primitives
├── lib/
│   ├── ai/                     # AI tool registry and executor (in-app chat)
│   ├── controllers/            # Business logic (structure, projects, etc.)
│   ├── export/                 # Google Docs exporter
│   ├── api-auth.ts             # Request authentication helpers
│   ├── auth.ts                 # Session/token management
│   ├── db.ts                   # Prisma client singleton
│   ├── env.ts                  # Validated environment variables
│   ├── types.ts                # Shared TypeScript types
│   └── utils.ts                # Shared utilities
├── mcp/
│   ├── index.ts                # MCP server entrypoint (48 tools)
│   ├── tools/                  # Tool implementations by category
│   └── skills.ts               # Writing skill loader (MCP Prompts)
└── __tests__/                  # Test files (Vitest)
```

## Request Lifecycle

1. **Client** makes HTTP request
2. **Middleware** (`src/middleware.ts`) checks authentication (session cookie or `Authorization: Bearer <API_TOKEN>`)
3. **API Route** validates input with Zod, delegates to a **Controller**
4. **Controller** runs business logic against **Prisma** (SQLite)
5. Response returned as JSON

Most write operations (scene save, node create) trigger an automatic **git snapshot** of the database via `autoSnapshot()` for agentic safety.

## Data Model

### Core Entities

```
Project (1) ──────────────────┬─── (N) StructureNode (PART | CHAPTER | SCENE)
                              │         └─── (N) ContentVersion (versioned content)
                              │         └─── (N) Annotation (inline comments)
                              └─── (N) StoryObject (CHARACTER | LOCATION | PLOTLINE | WORLD_ELEMENT | NOTE)
                              └─── (N) Conversation (named chat thread)
                              │         └─── (N) ChatMessage (AI chat history)
                              └─── (N) PeerReview (persisted multi-persona review snapshots)

Universe (1) ─────────────────┬─── (N) WorldObject (CHARACTER | LOCATION | WORLD_ELEMENT)
                              │         └─── (N) WorldObjectTimelineEntry
                              └─── (N) Project (linked via projectId)

Relationship ─── links any (StructureNode | StoryObject | WorldObject) to any other entity

AiSettings ─── global default AI provider config
UserAiSettings ─── per-user AI provider config (overrides global)
GoogleCredential ─── OAuth tokens per user
GoogleDocExport ─── (entity + mode) → Google Doc ID mapping
```

### Relationship Types

Relationships use nullable foreign keys to link any entity type to any other:
- `fromNodeId` / `toNodeId` — StructureNode endpoints
- `fromObjectId` / `toObjectId` — StoryObject endpoints

Relationship types: `APPEARS_IN`, `LOCATED_AT`, `PART_OF_PLOTLINE`, `RELATED_TO`, `INTERACTS_WITH`, `CONTAINS`, `PRECEDES`, `FOLLOWS`

## Controllers

Business logic is separated into controller classes under `src/lib/controllers/`:

| Controller | Responsibility |
|-----------|---------------|
| `StructureController` | Outline tree, scene content, versions, annotations, beats parsing |
| `ProjectsController` | Project CRUD, export (Markdown/Medium/StoryBible) |
| `StoryObjectsController` | Character/location/plotline CRUD |
| `UniversesController` | Universe and world object management |
| `TimelineController` | Timeline matrix computation |
| `FocusController` | Focus mode scene context + related elements |
| `GoogleAuthController` | Google OAuth flow + Docs export |

## AI Architecture

### In-App Chat (two-tier tool loading)

The chat endpoint (`POST /api/chat`) uses OpenAI-compatible streaming with dynamic tool loading to keep token costs low.

**Tier 1** (always loaded, ~8 core tools): project summary, outline, read/write scenes, story objects, relationships.

**Tier 2** (loaded on demand via `load_toolset` meta-tool): structure management, characters, world-building, export, admin, writing skills. The AI self-requests additional tools when needed.

This saves ~81% of token overhead vs loading all 48 tools upfront.

Tools are registered in `src/lib/ai/tool-registry.ts` using Zod schemas (shared with controllers) and executed via `src/lib/ai/tool-executor.ts`.

### MCP Server (external agents)

`src/mcp/index.ts` runs as a separate process via `npx tsx src/mcp/index.ts` inside the Docker container. It uses stdio transport and exposes 61 tools organized by category (Projects, Structure, StoryObjects, Universes, Export, DatabaseSafety, GoogleAuth, Skills). Includes batch operations for bulk scene/object CRUD (`batch_create_nodes`, `batch_update_nodes`, `batch_delete_nodes`, `batch_create_story_objects`, `batch_update_story_objects`, `batch_delete_story_objects`).

Six writing skills are registered as **MCP Prompts** (discoverable via `list_prompts`, invocable via `get_prompt`).

The MCP server is for **external agents only** (Claude Desktop, Gemini CLI). In-app chat calls controllers directly.

## Authentication

The app supports three auth modes (controlled by environment variables):

| Mode | When | How |
|------|------|-----|
| **No auth** | `API_TOKEN` unset | All requests allowed (local dev only) |
| **Token auth** | `API_TOKEN` set | Send `Authorization: Bearer <token>` header, or use session cookie from `/api/auth/login` |
| **Google OAuth** | `GOOGLE_CLIENT_ID/SECRET` set | Full OAuth flow with invite-list control via `ALLOWED_EMAILS` |

## Content Versioning

Every scene save creates a new `ContentVersion` record. The controller keeps the last 50 versions per scene (configurable) and prunes older ones. Versions store timestamp + full content + word count. Users can view history and restore any version (restore creates a new version from old content).

## Database Safety

The database at `data/word-coach-annie.db` is volume-mounted. Git-based snapshots are taken automatically before write operations from the MCP server. This enables rollback via `restore_snapshot` MCP tool.

**Never run `prisma db push` or `prisma migrate reset`** — these can drop tables. See [SETUP.md](SETUP.md) for safe schema migration procedure.

## Export Subsystem

### Markdown / Medium
Handled by `ProjectsController` — templates assembled from structure nodes and story objects.

### PDF
`src/app/api/projects/[id]/export/pdf/route.tsx` — server-side binary rendering using `@react-pdf/renderer`. The route fetches the project's outline tree with latest scene content, converts HTML to plain text via `stripHtml`, and renders a two-page `Document` (title page + body). Returns `application/pdf` with `Content-Disposition: attachment`.

### EPUB
`src/app/api/projects/[id]/export/epub/route.ts` — server-side EPUB generation using `epub-gen-memory`. The route assembles `EpubChapter` objects from the outline tree (PART → CHAPTER → SCENE hierarchy), strips beat annotations via `stripBeats`, and returns `application/epub+zip` with `Content-Disposition: attachment`. Scenes with empty content are excluded.

Both PDF and EPUB routes require project owner or shared reader access (`verifyProjectReadAccess`).

### Google Docs
`src/lib/export/google-docs.ts` implements idempotent sync: each (entity + mode) pair maps to exactly one Google Doc ID stored in `GoogleDocExport`. Re-exporting updates the document body in place rather than creating a new document.

Three export modes: `UNIVERSE` (world-building bible), `STORY_INTERNAL` (full manuscript with beats/synopsis), `STORY_READER` (clean reader version).

## Observability

- **Logging**: `src/lib/logger.ts` (structured, pino-compatible)
- **Error tracking**: Sentry (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`)
- **OpenTelemetry**: Custom spans on MCP tool calls and ADK agent operations (`src/instrumentation.ts`)
- **Health**: `GET /api/health` returns `{"ok": true}`

## Infrastructure

See [SETUP.md](SETUP.md) for detailed deployment instructions.

- **Container**: Node 20 slim base, Docker + Docker Compose
- **Networking**: Port 3000 bound to `127.0.0.1` only; Cloudflare Tunnel for public access
- **CI/CD**: GitHub Actions — typecheck → lint → build → test → deploy via SSH over Tailscale VPN
- **Backups**: `data/` directory backed up every 6 hours to local mount + Google Drive (rclone)
