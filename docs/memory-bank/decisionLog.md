# Decision Log

## DEC-001: Descope from cloud to local-first
- **Date**: 2025-02-13
- **Context**: Original SRS was a 37-page cloud app spec (MongoDB, GCP, Google Auth, Requesty.ai). Way too ambitious.
- **Decision**: Local-first app with SQLite, no auth, no cloud. Docker for isolation.
- **Rationale**: User needs the data management, not the cloud infrastructure. SQLite is portable and simpler. Markdown export covers distribution needs.

## DEC-002: Next.js full-stack over Python FastAPI
- **Date**: 2025-02-13
- **Context**: Original spec called for Python/FastAPI backend. User needs a UI.
- **Decision**: Next.js with App Router for both frontend and API routes.
- **Rationale**: Single codebase, TypeScript throughout, great React ecosystem for editor components (Tiptap). Faster iteration than maintaining separate frontend + backend.

## DEC-003: SQLite + Prisma over MongoDB
- **Date**: 2025-02-13
- **Context**: Original spec used MongoDB with Beanie ODM.
- **Decision**: SQLite via Prisma ORM.
- **Rationale**: The data is actually relational (foreign keys, hierarchies, typed relationships). SQLite is zero-config, single file, portable. Prisma gives type-safe queries and migrations.

## DEC-004: Polymorphic relationships via nullable foreign keys
- **Date**: 2025-02-13
- **Context**: Relationships need to link StructureNodes to StoryObjects (and vice versa).
- **Decision**: Relationship table has `fromNodeId`, `fromObjectId`, `toNodeId`, `toObjectId` — all nullable. Each relationship uses one from-column and one to-column.
- **Rationale**: SQLite doesn't support polymorphic relations natively. This approach keeps referential integrity via Prisma while allowing any-to-any linking. Simpler than a separate junction table per entity type.

## DEC-005: Gemini CLI over API integration (superseded by DEC-008)
- **Date**: 2025-02-13
- **Context**: User has extensive Gemini quota via CLI.
- **Decision**: Shell out to `gemini` CLI from API routes rather than using API keys directly.
- **Rationale**: No API key management needed. User's existing auth/quota just works. Simpler integration.
- **Status**: Superseded — AI chat now uses Requesty gateway (see DEC-008).

## DEC-006: Beat annotations as HTML comments
- **Date**: 2026-02
- **Context**: Scenes need inline "beat" markers (narrative waypoints) that guide writing but don't appear in exports.
- **Decision**: Store beats as `<!-- beat: ... -->` HTML comments inline in scene content. Custom Tiptap extension renders them as styled cards in the editor.
- **Rationale**: No separate database model needed. Portable (survives any markdown processor). Stripped on export via regex. Lightweight and backwards-compatible.

## DEC-007: Focus Mode three-panel layout
- **Date**: 2026-02
- **Context**: Writers need all relevant context visible while writing a scene.
- **Decision**: Three-panel layout — scene info (left), writing surface (center), related elements (right). Both sidebars collapsible.
- **Rationale**: Consolidates all scene context into one view. Collapsible sidebars allow distraction-free writing when desired. Related elements derived from existing relationships (no new data model).

## DEC-008: Requesty gateway for AI chat (replaced Gemini CLI)
- **Date**: 2026-03
- **Context**: Gemini CLI approach (DEC-005) was slow and hard to integrate with streaming. Needed proper streaming chat.
- **Decision**: Use OpenAI SDK pointed at Requesty gateway (`router.requesty.ai/v1`) with Gemini 2.0 Flash as the model. Store chat history in ChatMessage model.
- **Rationale**: OpenAI-compatible API gives streaming SSE, proper error handling, and model flexibility. Requesty routes to Gemini but could route to any model. Trade-off: requires API key, but Requesty aggregates user's existing model access.
- **Note**: Provider is currently hardcoded — planned fix in an-57d.

## DEC-009: Google Docs idempotent sync (not create-on-every-export)
- **Date**: 2026-03
- **Context**: Writers need to share work via Google Docs. Multiple exports shouldn't create duplicate documents.
- **Decision**: Each (entity + exportMode) maps to exactly one Google Doc ID. First export creates; subsequent exports replace the document body. Mapping stored in GoogleDocExport model.
- **Rationale**: Stable shareable URL. Beta readers bookmark once. Re-sync pushes latest content without creating document sprawl.

## DEC-010: MCP server for external agents only (no in-app MCP protocol)
- **Date**: 2026-03
- **Context**: MCP server has 48 tools. In-app AI chat needs tool use but MCP protocol (stdio transport) is wrong for server-side use.
- **Decision**: MCP server stays for external agents (Gemini CLI, Claude Desktop). In-app chat calls controllers directly, using the same Zod schemas to generate OpenAI function-calling definitions.
- **Rationale**: Avoids spawning a subprocess for each chat request. Controllers are already importable. Same validation (Zod). Enables dynamic tool loading (not possible with MCP's static tool list).

## DEC-011: Two-tier dynamic tool loading for AI chat
- **Date**: 2026-03-14
- **Context**: 48 tools × ~170 tokens each = ~8000 tokens per chat request. Most conversations use 3-4 tools.
- **Decision**: Two-tier approach: Tier 1 (always loaded, ~8 core tools: summary, outline, read/write scenes, story objects, relationships) + Tier 2 (loaded on demand via `load_toolset` meta-tool for categories: structure, characters, world-building, export, admin, skills).
- **Rationale**: 81% token savings (~1500 vs ~8000 tokens). AI self-serves additional tools when needed. Extra round-trip only for specialized operations. Core tools handle 80% of writing conversations.
