# Word Coach Annie - Claude Code Context

## Quick Start
At the start of each session, read these files to restore context:
1. `memory-bank/activeContext.md` - What we're working on right now
2. `memory-bank/progress.md` - What's done and what's next
3. `memory-bank/decisionLog.md` - Why we made the choices we did

For full specs: `REQUIREMENTS.md`
For tech details: `memory-bank/productContext.md`
For project origins: `memory-bank/projectBrief.md`

## Key Commands
- Start container: `docker compose up -d` (from project root)
- Run command in container: `docker compose exec app <command>`
- Run tests: `docker compose exec app npm run test:run`
- Push DB schema: `docker compose exec app npx prisma db push`
- View DB: `docker compose exec app npx prisma studio`
- View logs: `docker compose logs -f`
- Run MCP Server (manual): `docker compose exec app npx tsx src/mcp/index.ts`
- **Gemini CLI**: Run `gemini` in project root (auto-connects to MCP)

## Workflow
1. Edit source files directly (they're volume-mounted into the container)
2. Run commands inside the container via `docker compose exec app`
3. After completing a milestone or significant chunk of work:
   - Update `memory-bank/progress.md`
   - Update `memory-bank/activeContext.md`
   - Git commit with descriptive message
4. Log significant technical decisions in `memory-bank/decisionLog.md`

## Rules
- Always run npm/node commands inside the container, never on host
- Tests should accompany API routes and core logic
- Keep the memory bank updated so future sessions have full context
