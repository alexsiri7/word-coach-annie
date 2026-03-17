# Bundle Analysis Report

Generated: 2026-03-16 via `@next/bundle-analyzer` (`ANALYZE=true npm run build`)

## Summary

| Metric | Value |
|--------|-------|
| First Load JS (shared) | 220 kB |
| Heaviest page | `/project/[id]` — 311 kB |
| Lightest page | `/login` — 232 kB |
| Lazy-loaded chunks | TipTap (444 kB), ForceGraph (184 kB), ReactMarkdown (144 kB) |

## Shared Chunks (loaded on every page)

| Chunk | Size | Contents |
|-------|------|----------|
| `3639` | 400 kB (125 kB gzip) | Sentry SDK, Next.js internals |
| `4bd1b696` | 172 kB (54.4 kB gzip) | Sentry telemetry |
| `52774a7f` | 116 kB (37.4 kB gzip) | Next.js runtime |
| `main-app` | — | App router bootstrap |

Sentry dominates the shared bundle (~160 references in chunk 3639 alone).
`disableLogger: true` is already set in `next.config.ts`.

## Page-Level Breakdown

### `/project/[id]` (311 kB first load — heaviest)
17 chunks total. Page-specific extras:
- Chunk `2090` (64 kB) — `@dnd-kit` (drag-and-drop for outline tree)
- Chunk `2983` (36 kB) — Radix UI components
- Chunk `5804` (28 kB) — Radix UI + Lucide icons
- Chunk `3433` (32 kB) — Radix UI + d3 utilities
- Chunk `52` (24 kB) — Radix UI components

### `/` home (287 kB first load)
15 chunks. Similar to project page minus `@dnd-kit`.

### `/universe` (273 kB first load)
13 chunks. Standard UI component set.

### `/project/[id]/timeline` (253 kB first load)
10 chunks. Timeline-specific code adds ~16 kB.

### `/login` (232 kB first load)
7 chunks. Minimal — shared chunks + auth UI.

## Lazy-Loaded Chunks (on-demand via `next/dynamic`)

These are NOT included in first-load JS — they load only when their component mounts:

| Library | Chunks | Total Size | Loaded When |
|---------|--------|------------|-------------|
| TipTap + ProseMirror | `9212`, `70e0d97a`, `54a60aa6`, `5492` | 444 kB | Scene editor opens |
| react-force-graph-2d | `3735` | 184 kB | Graph view opens |
| react-markdown + remark | `7898` | 144 kB | AI chat panel opens |

Dynamic imports in `src/app/project/[id]/page.tsx`:
- `SceneEditor` — `dynamic(() => import("@/components/scene-editor"))`
- `StoryObjectPanel` — `dynamic(() => import("@/components/story-object-panel"))`
- `SearchPanel` — `dynamic(() => import("@/components/search-panel"))`
- `AIChatPanel` — `dynamic(() => import("@/components/ai-chat-panel"))`

Graph: `src/components/story-graph.tsx` uses `dynamic(() => import("react-force-graph-2d"), { ssr: false })`

## Server-Only Dependencies (verified NOT in client bundle)

- `googleapis` — API routes only, not in any client chunk
- `openai` — API route only (`/api/chat/route.ts`)
- `archiver` — API route only (`/api/projects/export-all/route.ts`)
- `@prisma/client` — Server only
- `@modelcontextprotocol/sdk` — Server only

## `optimizePackageImports` Audit

Current config covers 9 packages. Findings:

| Package | In Config | Actually Imported |
|---------|-----------|-------------------|
| `@radix-ui/react-accordion` | Yes | Yes |
| `@radix-ui/react-alert-dialog` | Yes | Yes |
| `@radix-ui/react-dialog` | Yes | Yes |
| `@radix-ui/react-dropdown-menu` | Yes | Yes |
| `@radix-ui/react-popover` | Yes | Yes |
| `@radix-ui/react-select` | Yes | Yes |
| `@radix-ui/react-separator` | Yes | **No** (unused) |
| `@radix-ui/react-tabs` | Yes | Yes |
| `@radix-ui/react-tooltip` | Yes | Yes |
| `@radix-ui/react-slot` | **No** | Yes |
| `lucide-react` | Yes | Yes |

**Action:** Add `@radix-ui/react-slot` to `optimizePackageImports`, remove `@radix-ui/react-separator`.

## Optimization Opportunities

### High Impact

1. **Sentry size (272 kB shared)** — Sentry SDK is the largest client dependency.
   Consider `@sentry/nextjs` lazy initialization or lighter SDK configuration.
   Already using `disableLogger: true` and `hideSourceMaps: true`.

2. **Radix UI fragmentation (~160 kB across 5+ chunks)** — Many small Radix chunks.
   The `optimizePackageImports` config helps but `@radix-ui/react-slot` is missing.

### Medium Impact

3. **`@dnd-kit` on `/project/[id]` (64 kB)** — Only needed when outline tree is
   visible. Could be lazy-loaded if outline tree becomes a dynamic component.

4. **Shared chunk overhead on `/login` (220 kB)** — Login page loads full Sentry
   SDK. Consider route-level Sentry lazy loading for auth pages.

### Already Optimized

5. **TipTap/ProseMirror** — Properly lazy-loaded (444 kB deferred)
6. **react-force-graph-2d** — Properly lazy-loaded with `ssr: false` (184 kB deferred)
7. **react-markdown** — Properly lazy-loaded via AIChatPanel dynamic import (144 kB deferred)
8. **Server-only deps** — googleapis, openai, archiver correctly isolated

## How to Re-Run

```bash
ANALYZE=true npm run build
# Reports generated at .next/analyze/{client,edge,nodejs}.html
# Or use the npm script:
npm run analyze
```
