# Progress

## Milestones Overview
- [x] **M0**: Project scaffolding, Docker, database schema
- [x] **M1**: Project CRUD + dashboard + basic layout
- [x] **M2**: Manuscript structure & scene editing
- [x] **M3**: Story objects & relationships
- [x] **M4**: Export & versioning
- [ ] **M5**: AI integration & polish
- [x] **M6**: MCP Server (Agentic Access)

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
- Implemented full MCP server with 25 tools
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
- Total: 69 tests passing across 9 test files

## Next Steps
- **M5**: Gemini CLI integration for AI brainstorming/summarization (F8)
- **M5**: UI polish and edge case handling
- **FR3**: Article templates (depends on FR2)
