# Active Context

## Current Phase
Post-M9: All core milestones complete. Focus on AI chat upgrade and infrastructure hardening.

## Current State
- Docker container running on port 3000 (Cloudflare Tunnel for public access)
- Database: 11 Prisma models, SQLite at `./data/word-coach-annie.db` (2.6MB)
- All CRUD APIs complete for Projects, Nodes, StoryObjects, Relationships, Universes, WorldObjects
- Content versioning with save, history, restore, and pruning
- Markdown export: full manuscript, per-chapter, story bible, Medium — all with configurable options
- Google Docs export with idempotent sync (3 modes: Universe, Internal, Reader)
- Full-text search across scenes and story objects
- Rich text editor (Tiptap) with beat annotations, auto-save, version history
- Scene Focus Mode (three-panel layout with related elements)
- Timeline View (story objects × scenes/chapters matrix)
- Article/non-fiction templates with dynamic UI labels
- AI chat panel per project (streaming, via Requesty → Gemini 2.0 Flash)
- MCP Server: 48 tools + 6 writing skills as MCP Prompts
- Dark theme premium UI (Shadcn/ui + Tailwind)
- CI/CD: GitHub Actions (typecheck, lint, build, test) + deploy via SSH
- Backups: every 6h to local + Google Drive
- 12 test files, 69+ tests, ~6.6% coverage

## Completed Features (all milestones)
- M0–M4: Foundation, CRUD, editing, export, versioning
- M5: AI chat, search, UI polish
- M6: MCP Server (48 tools, git snapshots)
- M7: Universes (world objects, timeline entries)
- M8: MCP Skills (6 writing skills as Prompts)
- M9: Article templates (project types, Medium export)
- FR5: Scene beats (inline HTML comments, Tiptap extension)
- FR6: Scene Focus Mode (three-panel, related elements)
- FR7: Timeline View (relationship-derived matrix)
- FR8: Google Docs Export (OAuth2, idempotent sync)

## Recent Completions
- **Offline read-cache**: IndexedDB fallback for projects, outline, story objects, and scene content (`src/lib/offline/cache-reads.ts`). "Cached" badge shown in editor toolbar when serving from IndexedDB.

## In Progress
- **an-yoz**: Docker registry deploy with rollback (polecat working)

## Priority Queue (next up)
1. **an-xo8** (P1): MCP-powered AI chat — upgrade in-app chat to use MCP tools via dynamic two-tier loading. This is the biggest feature gap.
2. **an-57d** (P2): Configurable AI provider — remove Requesty/Gemini hardcoding
3. **an-2v3** (P2): Outline tree drag-and-drop reordering (F2.3 — never implemented)
4. **an-aoo** (P2): Raise test coverage from 1% to 30%

## Key Gap: AI Chat Has No MCP Integration
The AI chat panel (`src/app/api/chat/route.ts`) is a vanilla OpenAI API call. It gets project context as a system prompt but cannot use any of the 48 MCP tools. The MCP server is only accessible to external agents (Gemini CLI).

**Planned architecture** (an-xo8): Two-tier dynamic tool loading:
- Tier 1 (always loaded, ~8 tools): project summary, outline, read/write scenes, story objects, relationships
- Tier 2 (on demand via `load_toolset` meta-tool): structure, characters, world-building, export, admin, skills
- Calls controllers directly (no MCP protocol needed for in-app chat)
- Saves ~6500 tokens per message vs loading all 48 tools

## Blockers
None currently.

## Infrastructure Notes
- Database backed up every 6h to `/mnt/steam-fast/backups/annie/` + Google Drive (rclone)
- **NEVER run `prisma db push` on production** — use hand-written ALTER TABLE migrations
- Docker registry deploy (an-yoz) will replace current SSH+git pull deploy
- CI coverage threshold at 1% (actual ~6.6%) — raise incrementally
