# Active Context

## Current Phase
M5: AI Integration & Polish + Feature Requirements

## Current State
- Docker container running on port 3000
- Database with 8 models fully functional (original 5 + Universe, WorldObject, WorldObjectTimelineEntry)
- All CRUD APIs complete for Projects, Nodes, StoryObjects, Relationships, Universes, WorldObjects
- Content versioning with save, history, restore, and pruning
- Markdown export: full manuscript, per-chapter, story bible — all with configurable options
- Full-text search API across scenes and story objects
- Dashboard, Project page, Scene Editor, Story Object panel all functional
- Dark theme premium UI design (Search, Version History, Settings updated)
- MCP Server integrated (40+ tools + git safety snapshots)
- **FR2 (Universes)** implemented: schema + controller + tests + API routes + MCP tools
- **FR4 (MCP Skills)** implemented: 6 curated skills + skill loader + MCP Prompts + list_skills tool
- 69 tests passing across 9 test files

## Immediate Goals
1. FR3: Article templates (project types, label maps, Medium export)
2. Gemini CLI integration for AI features (F8)
3. UI polish and edge case handling

## Blockers
- Pre-existing Next.js build error (`<Html>` import in pages/_document context) — unrelated to FR4

## Session Notes
- FR4 fully implemented: `.skills/` folder with 6 skills, `src/mcp/skills.ts` loader, prompts registered in MCP server
- Skills are discoverable via `list_skills` tool and `list_prompts` MCP primitive
- Test DB needed schema push (`DATABASE_URL="file:./test.db" npx prisma db push`) to sync Universe tables

