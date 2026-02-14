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

## DEC-005: Gemini CLI over API integration
- **Date**: 2025-02-13
- **Context**: User has extensive Gemini quota via CLI.
- **Decision**: Shell out to `gemini` CLI from API routes rather than using API keys directly.
- **Rationale**: No API key management needed. User's existing auth/quota just works. Simpler integration. Trade-off: slightly slower than direct API calls, but acceptable for AI features that aren't latency-critical.
