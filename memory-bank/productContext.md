# Product Context

## Tech Stack
| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | Full-stack, TypeScript strict |
| Database | SQLite via Prisma ORM | File: `data/word-coach-annie.db` |
| UI | React + Tailwind CSS | Will add shadcn/ui as needed |
| Editor | Tiptap (ProseMirror) | Not yet installed |
| AI | Gemini CLI (subprocess) | Not yet integrated |
| Agent API | MCP Server | Running via `src/mcp/` |
| Testing | Vitest | Configured, no tests yet |
| Container | Docker Compose | Running on port 3000 |

## Project Structure
```
word-coach-annie/
  memory-bank/         # This context system
  prisma/
    schema.prisma      # Database schema (5 models)
  src/
    app/               # Next.js App Router pages
    lib/
      db.ts            # Prisma client singleton
    mcp/               # MCP Server implementation
      index.ts         # Server entry point
      tools/           # Tool implementations
  data/
    word-coach-annie.db  # SQLite database
  docker-compose.yml
  REQUIREMENTS.md
```

## Database Models
1. **Project** - Top-level writing project (title, author, synopsis, genre)
2. **StructureNode** - Hierarchical: PART > CHAPTER > SCENE (self-referencing parentId)
3. **StoryObject** - CHARACTER, LOCATION, PLOTLINE, WORLD_ELEMENT, NOTE
4. **ContentVersion** - Versioned text content per scene (timestamp-based history)
5. **Relationship** - Polymorphic links between any node/object pair, typed

## Key Patterns
- Prisma singleton in `src/lib/db.ts` (prevents hot-reload connection leaks)
- API routes via Next.js App Router (`src/app/api/...`)
- SQLite file persisted via Docker volume mount to `./data/`
- Source mounted into container for hot reload
- Commands run inside container: `docker compose exec app <cmd>`
- MCP server runs inside Docker for shared environment/schema

## Conventions
- TypeScript strict mode
- Tailwind for styling
- snake_case for database fields (Prisma maps to camelCase)
- API routes return JSON
- Tests alongside source or in `__tests__/` folders
