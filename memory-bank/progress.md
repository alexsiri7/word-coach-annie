# Progress

## Milestones Overview
- [x] **M0**: Project scaffolding, Docker, database schema
- [x] **M1**: Project CRUD + dashboard + basic layout
- [x] **M2**: Manuscript structure & scene editing
- [x] **M3**: Story objects & relationships
- [x] **M4**: Export & versioning
- [ ] **M5**: AI integration & polish

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

## Next Steps
- **M5**: Gemini CLI integration for AI brainstorming/summarization
- **M5**: Full-text search UI in the project page
- **M5**: UI polish and edge case handling
