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

## DEC-012: One ownership convention for user-scoped entities — null userId is an unscoped deployment-level caller
- **Date**: 2026-09-08
- **Context**: Opportunities and providers filtered on `where: { userId }` and their routes returned 401 whenever `userId` was null, so in a deployment with no auth configured — the one mode where MCP tools ever see a null userId — the whole opportunities/providers/publishing surface was unreachable from the web UI while `/api/projects` and `/api/universes` served the same caller (issue #1115).
- **Decision**: A null `userId` means the deployment-level caller of a single-user install: routes 401 only when `isGoogleAuthMode() && !userId`, list queries fall back to no filter, and ownership checks compare only when a real userId is present. A real userId is still matched exactly.
- **Rationale**: This is the convention `verifyProjectAccess`/`verifyUniverseAccess`, `ProjectsController.listProjects` and MCP's `verifyProjectOwnership` already use; opportunities and providers were the outliers. It is safe because `/api/mcp` 401s a null caller whenever `isAuthEnabled()`, so a null userId can only reach these controllers when Google auth is off. The alternative — resolving a `'local'` sentinel user in the MCP layer, as `GoogleCredential` does — is blocked by `Opportunity.userId` and `Provider.userId` being foreign keys to `User`, and would not fix the bug anyway since the web side reads `getCurrentUserId`, which still returns null.

## DEC-013: Retry database connection faults at the client, only when the statement never reached Postgres
- **Date**: 2026-09-22
- **Context**: Issue #1143 (filed from Sentry) reported `DriverAdapterError: Failed to connect to database: {:error, :nxdomain}` — Supavisor, the Supabase pooler, briefly could not resolve the upstream database host, so a request-time query failed and the user got a 500. `src/lib/db.ts` had no resilience of any kind; the equivalent fault at container startup was already handled by the retry loop `migrate.mjs` gained in #1122.
- **Decision**: Wrap the shared Prisma client in a `$allOperations` query extension (`src/lib/db.ts`) that retries twice, after 150 ms and 600 ms, via `withConnectionRetry` in `src/lib/db-retry.ts`. Retry **only** errors that prove the statement never reached Postgres: a failure to establish the connection (`DatabaseNotReachable`, `TlsConnectionError`, `PrismaClientInitializationError`, or a Postgres FATAL whose message matches `/failed to connect to database/i`). `ConnectionClosed` and `SocketTimeout` are ambiguous — the statement may already have committed — and must stay out, as must `TooManyConnections`, where retrying would amplify the saturation that caused it. When the attempts are exhausted the original error propagates unchanged, so the route's existing catch still reports it to Sentry and returns a 500.
- **Rationale**: One choke point covers all ~100 importers of `prisma` with no call-site changes, and the connect-phase discriminator is what makes the retry safe for writes as well as reads — a read/write split would have leaked on `$queryRawUnsafe`. Interactive `$transaction` callbacks are deliberately not retried: their connection is already aborted and re-running the callback would repeat its non-database side effects.

## DEC-014: Writing tasks carry their own owner so they can exist without a project
- **Date**: 2026-09-27
- **Context**: Requirement 032 (issue #1148) needs practice-level writing tasks with no project, but `verifyProjectOwnership` — the only authorization for writing tasks — is keyed on a project. With `projectId` nullable, nothing on a project-less row would scope it to a user, so a list call would return every user's practice tasks.
- **Decision**: `WritingTask` gains a nullable `userId` (FK to `User`, cascade on delete). It always holds the owner of the task's scope: the project's owner for project tasks (copied at create time, so an editor creating a task on a shared project does not become its owner; backfilled from `Project.userId` by the migration) and the creator for practice tasks. Project tasks stay authorized through their project; practice tasks are matched on `userId` under the DEC-012 null-caller convention. The MCP `update_writing_task`/`complete_writing_task` tools, which previously had no ownership check, now verify it.
- **Rationale**: Mirrors `Project`, `Provider` and `Opportunity`, which carry their own `userId`. Keeping the invariant for project tasks too means a cross-project query (the #1149 dashboard) can filter by `userId` alone. Rejected: a synthetic per-user "Practice" project (pollutes project lists and exports) and scoping by the MCP session without persisting an owner (nothing to filter on).

## DEC-015: Inline styles under a nonce-only style-src
- **Date**: 2026-10-28
- **Context**: `style-src` still allowed `'unsafe-inline'` (issue #1371, the remaining half of SEC-43 / #1330), so any HTML injection could bring its own `<style>` block or `style=` attribute. The 24 `style={…}` props were not the real obstacle: React applies client-side style props through the CSSOM, which CSP does not govern. The blockers were libraries that inject `<style>` tags — TipTap, react-remove-scroll (Radix Dialog/Popover/Select/DropdownMenu), Radix Select's viewport, and force-graph/float-tooltip on the story graph.
- **Decision**: `style-src 'self' 'nonce-…'` plus three pinned hashes. The rule is no `style=` in server-rendered markup and no un-nonced `<style>`. Client code reads the nonce from the document (`getCspNonce()`, the `.nonce` property of a Next-emitted script) rather than through props, and hands it to TipTap (`injectNonce`), Radix Select (`nonce`) and get-nonce (`setNonce`, read by react-remove-scroll). force-graph and float-tooltip have no nonce hook, so their CSS and the empty string their `styleInject` inserts first are allowed by hash; `proxy.test.ts` recomputes those hashes from `node_modules`. Static inline styles became classes; dynamic client-only style props stay; stored manuscript HTML is rendered with `style` stripped.
- **Rationale**: `style-src-elem 'unsafe-inline'` with `style-src-attr 'none'` would still admit injected `<style>` blocks, the main CSS-exfiltration vector, and hashes alone cannot cover react-remove-scroll's runtime gap widths, so the page's existing nonce is reused. Reading the nonce from the DOM always yields the one the document was served with, where a prop could go stale on a server re-render of the root layout.

## DEC-016: READER shares get the current text of non-outline scenes only
- **Date**: 2026-10-29
- **Context**: Issue #1259 (SEC-18). Every read-gated route treated a READER share like its owner, so a reader could pull full version history, any past version by id, OUTLINE-scene text (content route, node route and the PDF/EPUB/DOCX exports), AI peer reviews and writing tasks. The owner's default on the issue settled the capability matrix: "Least privilege for READER: the current text of non-outline scenes only. No version history or versionId, no outline-only scenes (including in exports), no AI reviews, no writing tasks; the timeline is read-only."
- **Decision**: Each affected GET checks `access.role === "READER"` right after authorization and answers `403 { error: "Forbidden" }` — `?versionId=`, OUTLINE scenes on `/api/nodes/:id` and `/api/nodes/:id/content`, both peer-review GETs and `GET /api/writing-tasks`. The plain content fetch keeps its shape with `history: []`. Exports pass `excludeOutlineScenes` to `buildOutlineTree`; it, the node routes and the manuscript Read view share one predicate, `isHiddenOutlineScene`. OWNER, EDITOR and the null-role API_TOKEN/dev caller are unchanged; the timeline route was already GET-only.
- **Rationale**: A 403 states the policy instead of passing a reader off as an author with no data, and every client already treats non-2xx like an empty result. Filtering in `buildOutlineTree` keeps the rule in one place for all three export formats; owner exports keep their OUTLINE scenes because the default did not ask to change them. Structure metadata of OUTLINE scenes (titles, synopsis) is not scene text and stays visible.

## DEC-017: Location images live in a private Supabase Storage bucket, owner-only
- **Date**: 2026-11-13
- **Context**: #1478 attaches reference, mood and sketch images to locations. Annie had no file storage, production runs in a 512 MB Railway container with ~389 MB steady RSS, and the Supabase plan's 5.5 GB/month egress has been blown before.
- **Decision**: Files go to a private bucket through a four-endpoint REST client (`src/lib/storage/supabase-storage.ts`, service-role key, no SDK). Uploads are re-encoded with `sharp` to WebP ≤ 2048 px plus a 400 px thumbnail, metadata stripped, capped at 20 MB and 25 megapixels. Browsers load `/api/location-images/:id/file`, which 302s to an hour-long signed URL and is cached for 50 minutes; MCP gets signed URLs directly. Only the project owner can read or write them, as the issue says; shared readers and editors are refused.
- **Rationale**: The SDK pulls in APIs this needs none of. 25 MP keeps a single decode near 65 MB peak (40 MP measured up to 260 MB). A stable Annie URL plus immutable objects with a one-year cache means a thumbnail costs egress about once per session. Owner-only matches the story bible list, which shared users cannot reach today; widening it later means swapping the access check in three route files.

## DEC-018: Location maps are one JSON row edited on an SVG canvas
- **Date**: 2026-11-14
- **Context**: #1479 adds a top-down map to locations: items of five kinds that the author drags, resizes and rotates with mouse or touch, with undo, and that Claude drafts over MCP. Nothing in Annie did freeform canvas editing before, and the issue fixes the item shape as a validated list.
- **Decision**: One `LocationMap` row per location holds the size, an optional background image (`onDelete: SetNull`) and `items` as JSON, validated by one zod schema on every REST and MCP write. `x, y` is an item's centre and an area's points are relative to it, so move, rotate and resize are the same for every kind. Links are stored as ids and resolved to names on read, within the project, so renames follow and deleted targets show as unlinked. The editor is plain SVG with Pointer Events (one path for mouse, pen and touch, two-finger pinch included), undo is a session-only stack of whole-map snapshots, and the map autosaves 800 ms after a change. REST writes are last-write-wins; MCP's `set_location_map` needs the read's contentHash. Owner-only, like images.
- **Rationale**: A table of items would add ordering and join code for no requirement the JSON fails, and item edits already run Serializable. Resolving links on read avoids rewriting maps when story objects change. Canvas libraries (konva, fabric, interactjs) add a dependency for five interactions, draw to `<canvas>` that tests cannot target, and inject styles that the nonce-only CSP would refuse (DEC-015); SVG attributes are not styles. Labels are drawn in canvas pixels because Chrome garbles text whose font size is a fraction of a unit under a large scale.

## DEC-019: Game snapshots find locations by the export's slug and outlive nothing but their notes
- **Date**: 2026-11-15
- **Context**: #1486 lets a game's build job post screenshots of locations with their clickable things, for the author to annotate. The job knows locations only by the file names the story-sync export writes (`location/<slug>.md`, alexsiri7/interstellarai.net `ops/cron/lib/annie_export.py`), and it posts daily whether or not anything changed.
- **Decision**: The slug is computed at request time by an exact port of the export's `slug()` and `-2`/`-3` dedup loop over the project's LOCATIONs, sorted by code point as Python does (`src/lib/location-snapshots/slug.ts`); no slug column is stored. Dedup hashes the uploaded bytes, before any decoding, together with the things sorted by key. Thing boxes and annotation regions are in the uploaded screenshot's pixels, recorded as the snapshot's width and height even when the stored WebP is downscaled. Ten snapshots per location are kept, by receipt order; pruning sets annotations' `snapshotId` to null so notes survive as text. A new `snapshots` token scope reaches the upload route only.
- **Rationale**: Computing the slug the way the export does keeps the two in step through renames without a migration; an unknown slug fails loudly with the known ones. Hashing the upload lets an unchanged daily post return before sharp runs and survives sharp upgrades that would change a re-encoded hash. The game's clock is not trusted for retention. A separate scope keeps existing read/write tokens' surface unchanged and keeps a build machine's credential away from scenes and MCP.
