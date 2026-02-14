# Active Context

## Current Phase
M5: AI Integration & Polish

## Current State
- Docker container running on port 3000
- Database with 5 models fully functional
- All CRUD APIs complete for Projects, Nodes, StoryObjects, Relationships
- Content versioning with save, history, restore, and pruning
- Markdown export: full manuscript, per-chapter, story bible — all with configurable options
- Full-text search API across scenes and story objects
- Dashboard, Project page, Scene Editor, Story Object panel all functional
- Dark theme premium UI design
- 49 tests passing (Prisma-level + API-level)

## Immediate Goals
1. Gemini CLI integration for AI features (F8)
2. Search UI in Project page connected to /api/projects/[id]/search
3. UI polish and edge case handling
4. Consider full-text search UI (search bar in header)

## Blockers
None.

## Session Notes
- Export param bug fixed: frontend sends `type=manuscript`, API now accepts both `type` and `format`
- Version pruning set to 50 max versions per scene
- All commands run inside container via `docker compose exec app <cmd>`
