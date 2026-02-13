# Active Context

## Current Phase
M1: Project CRUD + Dashboard + Basic Layout

## Current State
- Docker container running on port 3000
- Database initialized with empty tables
- Placeholder landing page showing "Word Coach Annie"
- No API routes yet, no real UI yet

## Immediate Goals
1. Install shadcn/ui for component library
2. Build API routes for Project CRUD (create, list, get, rename, delete)
3. Build dashboard page showing all projects
4. Build basic app shell layout (sidebar navigation + main content area)
5. Write tests for Project CRUD API

## Blockers
None.

## Session Notes
- User wants vibe-coding approach but with tests
- All commands run inside container via `docker compose exec app <cmd>`
- Hot reload is working (source mounted as volume)
