# Progress

## Milestones Overview
- [x] **M0**: Project scaffolding, Docker, database schema
- [ ] **M1**: Project CRUD + dashboard + basic layout
- [ ] **M2**: Manuscript structure & scene editing
- [ ] **M3**: Story objects & relationships
- [ ] **M4**: Export & versioning
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

## Next Steps
- **M1**: Build project CRUD API routes
- **M1**: Build dashboard page (list projects)
- **M1**: Build basic app layout (sidebar + main area)
- **M1**: Add shadcn/ui components
