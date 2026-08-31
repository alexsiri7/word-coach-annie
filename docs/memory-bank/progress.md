# Progress

## Milestones Overview
- [x] **M0**: Project scaffolding, Docker, database schema
- [x] **M1**: Project CRUD + dashboard + basic layout
- [x] **M2**: Manuscript structure & scene editing
- [x] **M3**: Story objects & relationships
- [x] **M4**: Export & versioning
- [x] **M5**: AI integration & polish
- [x] **M6**: MCP Server (Agentic Access)
- [x] **M7**: Universes (FR2)
- [x] **M8**: MCP Skills (FR4)
- [x] **M9**: Article Templates (FR3)
- [x] **FR5**: Scene Beats
- [x] **FR6**: Scene Focus Mode
- [x] **FR7**: Timeline View
- [x] **FR8**: Google Docs Export / Sync
- [x] **FR9**: Submission Tracking (data model, API, dashboard widget, submissions list page)

## Completed Work

### 2025-02-13: M0 - Foundation
- Created project in `word-coach-annie/` subfolder
- Wrote `REQUIREMENTS.md` (full local-edition spec, descoped from original SRS)
- Set up Docker Compose (Node 20 + SQLite)
- Created Prisma schema with 5 models: Project, StructureNode, StoryObject, ContentVersion, Relationship
- Scaffolded minimal Next.js 15 app with Tailwind
- Configured Vitest
- Initialized SQLite database (`prisma db push`)
- Verified container runs and serves on localhost:3000
- Initialized git, first commit
- Set up memory bank

### 2025-02-13: M1–M3 - Core Features + UI
- Built all API routes (Projects, Nodes, Content, StoryObjects, Relationships, Outline, Export)
- Built Dashboard page with project CRUD
- Built Project page with sidebar (outline tree + story object tabs)
- Built Scene Editor with Tiptap rich text and auto-save
- Built Story Object panel with detail editing
- Built Outline Tree component
- Dark theme UI with premium design system
- Content version history UI

### 2026-02-14: M4 - Backend & Storage Finalization
- Fixed export route parameter mismatch (frontend `type` vs API `format`)
- Added version restore endpoint (PATCH /api/nodes/[id]/content)
- Added specific version fetch (GET /api/nodes/[id]/content?versionId=)
- Added version pruning (auto-cleanup beyond 50 versions per scene)
- Added per-chapter export mode (format=chapters returns JSON array)
- Added configurable export options (includeSynopsis, includeSceneBreaks, chapterNumbering)
- Added full-text search endpoint (GET /api/projects/[id]/search?q=)
- Added comprehensive API-level test suite (api-routes.test.ts)
- Fixed Project type to include optional wordCount field
- All 49 tests passing

### 2026-02-14: M6 - MCP Server Integration
- Implemented full MCP server with 25 tools (now 48)
- Integrated into main project (`src/mcp/`) running inside Docker
- Added Git-based database snapshots for safety
- Configured Gemini CLI to connect via Docker exec
- Added `create_project` tool per user request
- Consolidated documentation (`CLAUDE.md`, `REQUIREMENTS.md`, `memory-bank`)

### 2026-02-14: M5 - UI Integration (Backend Features)
- **Search**: Integrated `SearchPanel` with debounced input and highlighted snippets
- **Versioning**: Enhanced `SceneEditor` with version preview and restore confirmation
- **Export**: Added toggle options and per-chapter export to Settings page
- **Fixes**: Resolved 500 error on app startup (corrupted build)
- **Verification**: Manually verified all new UI flows

### 2026-02-15: FR4 — MCP Skills Architecture
- Created `.skills/` directory with 6 curated writing skills:
  - `developmental-edit` — structural/story-level feedback
  - `line-edit` — sentence-level clarity, voice, word choice
  - `consistency-check` — cross-reference world elements for contradictions
  - `plot-structure-analysis` — analyze structure against frameworks (3-act, hero's journey, etc.)
  - `character-arc-review` — map character arcs, identify flat arcs
  - `scene-drafting-assistant` — help draft scenes from outline context
- Created `src/mcp/skills.ts` — skill loader utility (parses YAML frontmatter from SKILL.md files)
- Registered all 6 skills as **MCP Prompts** (discoverable via `list_prompts`, invocable via `get_prompt`)
- Added `list_skills` tool to MCP server (returns metadata for all skills)
- Added 11 new tests in `src/__tests__/skills.test.ts` — all passing

### 2026-02: FR2 — Universes
- Added Universe, WorldObject, WorldObjectTimelineEntry models to Prisma schema
- Full controller + API routes + MCP tools for universe management
- Universe UI: top-level page, world object panels, timeline tracking
- Link/unlink projects to universes
- Transfer story objects from project to universe scope

### 2026-02: FR5 — Scene Beats
- Custom Tiptap extension (`beat-extension.ts`) for `<!-- beat: ... -->` HTML comments
- Beats render as styled divider cards in the editor
- Beat insertion via toolbar button and keyboard shortcut
- Beats stripped from all export output (manuscript, story bible, medium)
- Tests in `beats.test.ts`

### 2026-02: FR6 — Scene Focus Mode
- Three-panel layout: scene info (left), writing surface (center), related elements (right)
- Route: `/project/[id]/scene/[sceneId]/focus`
- Related elements panel shows story objects linked via relationships
- Scene navigation (prev/next) without leaving focus mode
- Both sidebars collapsible for distraction-free writing

### 2026-02: FR7 — Timeline View
- Route: `/project/[id]/timeline`
- Horizontal axis: scenes/chapters in order; vertical axis: story objects
- Event markers where relationships exist between objects and scenes
- Filtering by object type, zoom between chapter/scene level
- Click-to-navigate from timeline markers to scenes

### 2026-02: FR3 — Article Templates
- Added `projectType` field (FICTION, ARTICLE_COLLECTION, GENERAL)
- Dynamic UI labels (Chapter→Article, Scene→Section, Character→Persona, etc.)
- Medium-compatible Markdown export with front matter
- MCP tool: `export_medium`

### 2026-08-31: FR9 — Submission Tracking UI
- Added `SubmissionActivitySummary` widget to project dashboard empty state
- Added header nav button (SendHorizontal) linking to `/project/[id]/submissions`
- Added read-only `/project/[id]/submissions` page listing contest and publication submissions
- Extracted `computeSubmissionSummary` pure helper for testability
- Submission data model and API endpoints added in prior PRs (#1052, #1054)

### 2026-03: FR8 — Google Docs Export / Sync
- OAuth2 flow with Google (googleapis + google-auth-library)
- Three export modes: UNIVERSE, STORY_INTERNAL, STORY_READER
- Idempotent sync — same Google Doc updated on re-export
- GoogleCredential and GoogleDocExport Prisma models
- Settings UI for Google account connection
- MCP tools: google_auth_status/connect/callback/disconnect, export_to_google_docs

### 2026-03: AI Chat Panel
- Per-project streaming AI chat via Requesty → Gemini 2.0 Flash
- System prompt dynamically built from project context (outline, characters, etc.)
- Chat history stored in ChatMessage model (last 20 messages for context)
- Optional scene context injection (current scene content)
- Markdown rendering with DOMPurify sanitization

### 2026-03: Infrastructure & Stability
- CI/CD pipeline: GitHub Actions (typecheck, lint, build, test with coverage)
- Deploy via Tailscale VPN + SSH (Docker registry deploy in progress: an-yoz)
- Cloudflare Tunnel for public access
- Database backup: every 6h to /mnt/steam-fast + Google Drive (rclone)
- Annie DB moved to volume mount (was inside container — data loss risk)
- Coverage threshold at 1%, raising incrementally (actual ~6.6%)
- XSS protection via DOMPurify on all user content
- N+1 query fixes for performance

## Current State (as of 2026-03-14)

**Test suite**: 12 test files, 69+ tests, ~6.6% coverage
**MCP server**: 48 tools + 6 skills as MCP Prompts
**Database**: 11 Prisma models, SQLite at `./data/word-coach-annie.db` (2.6MB)

## Open Work (tracked in beads)

| ID | P | Title |
|----|---|-------|
| an-xo8 | P1 | MCP-powered AI chat with dynamic tool loading |
| an-57d | P2 | Configurable AI provider (remove Requesty hardcoding) |
| an-2v3 | P2 | Outline tree drag-and-drop reordering (F2.3) |
| an-aoo | P2 | Raise test coverage from 1% to 30% |
| an-47z | P3 | Decompose scene-editor.tsx (37KB monolith) |
| an-l1e | P3 | Replace hand-rolled markdown renderer in chat |
| an-4h0 | P3 | Clean up 53+ debug console.log statements |
| an-yoz | P1 | Docker registry deploy with rollback (in progress) |
| an-sla | P2 | Fix flaky tests (replace setTimeout with async) |
