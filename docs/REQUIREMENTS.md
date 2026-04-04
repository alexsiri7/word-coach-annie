# Word Coach Annie - Local Edition

## Vision

A local-first fiction writing and book management tool for novelists. Manages the
complex web of data behind a long-form narrative (structure, characters, locations,
plotlines, relationships) and exports clean Markdown for distribution to beta readers.

## Core Principles

- **Local-first**: Everything runs on your machine. No cloud, no accounts, no subscriptions.
- **SQLite**: Single portable database file. Easy to backup, version, or move.
- **Markdown export**: The primary output is a clean `.md` file ready for readers.
- **AI-assisted via Gemini**: Uses your existing Gemini quota for brainstorming, analysis, and drafting assistance.
- **MCP Server**: Provides direct CLI access to project data for AI agents.
- **Docker-contained**: Runs in a container so it can't mess with your system.

## Data Model

### Project
- A single writing project (e.g., one novel)
- Has a title, author name, synopsis, genre, type (FICTION/ARTICLE_COLLECTION/GENERAL)
- Supports archiving (`archivedAt`) and sample projects (`isSample`)

### Structure Nodes (Hierarchical)
- **Part** (optional top-level grouping)
- **Chapter** (contains scenes)
- **Scene** (the atomic unit of writing)
- Each has: title, synopsis, status (Outline/Draft/Revised/Final), order index
- Scenes have: rich text content (HTML), word count (auto-calculated)

### Story Objects
- **Character**: name, description, notes, role (protagonist/antagonist/supporting/minor)
- **Location**: name, description, notes
- **Plotline**: title, description, notes
- **World Element**: name, description, notes (magic systems, factions, tech, etc.)
- **Note**: title, content (general-purpose scratchpad)
- All types share: created/updated timestamps, custom tags

### Relationships
- Link any two entities (structure nodes or story objects) together
- Typed relationships: APPEARS_IN, LOCATED_AT, PART_OF_PLOTLINE, RELATED_TO, etc.
- Optional label/description on each relationship

### Universes
- **Universe**: High-level container for shared world-building (optional)
- **WorldObject**: Characters, Locations, World Elements scoped to a Universe
- **WorldObjectTimelineEntry**: Ordered events tracking how a world object evolves over time

### Content Versioning
- Scene content is versioned: each save creates a new ContentVersion
- Can view history and restore previous versions

### Users & Auth
- **User**: email, googleId, name, picture (Google OAuth)
- **ProjectShare**: links a User to a Project with READER/EDITOR/OWNER roles
- **OAuthClient**: registered OAuth2 clients for API access

### Integrations
- **GoogleCredential**: OAuth2 token for Google Docs export/sync
- **GoogleDocExport**: tracks exported documents and last sync timestamps
- **MediumCredential**: encrypted API token for Medium publishing
- **MediumExport**: tracks published posts and their status

### AI
- **ChatMessage**: per-project conversation history (projectId, role, content)
- **UserAiSettings**: coaching style, response length, model preferences, custom instructions
- **AiSettings**: global AI configuration (model, baseUrl, apiKey)

### Writing Sessions
- **WritingSession**: auto-tracked sessions (projectId, nodeId, wordsWritten, durationSeconds, date)

### Annotations
- **Annotation**: range-based comments on scene content (nodeId, content, resolved, range, selectedText, externalId for Google Docs sync)

## Functional Requirements

### F1: Project Management
- F1.1: Create, rename, delete projects
- F1.2: Dashboard showing all projects with last-modified date and word count
- F1.3: Project settings (title, author, synopsis, genre)
- F1.4: Archive/unarchive projects; sample projects for onboarding

### F2: Manuscript Structure
- F2.1: Hierarchical outline view (sidebar tree: Parts > Chapters > Scenes)
- F2.2: Create/rename/delete structure nodes
- F2.3: Drag-and-drop reordering of nodes within and between parents
- F2.4: Scene status indicators in the outline (color-coded by status)

### F3: Scene Editing
- F3.1: Rich text editor for scene content (bold, italic, underline, headings, lists)
- F3.2: Auto-save on edit (debounced, creates content versions)
- F3.3: Scene metadata panel (synopsis, status, word count)
- F3.4: Word count per scene and total project word count
- F3.5: Beats (story beat markers) embedded as HTML comments, rendered as styled dividers in editor

### F4: Story Object Management
- F4.1: CRUD for Characters, Locations, Plotlines, World Elements, Notes
- F4.2: List/filter story objects by type
- F4.3: Detail view with description and notes (rich text)
- F4.4: Quick-link story objects to scenes from the editor sidebar

### F5: Relationship Management
- F5.1: Create/delete typed relationships between any entities
- F5.2: View relationships for any entity ("Alice appears in: Scene 1, Scene 5, Scene 12")
- F5.3: Relationship panel in scene editor showing linked characters/locations/plotlines

### F6: Markdown Export
- F6.1: Export entire manuscript as single `.md` file (front matter + parts/chapters/scenes)
- F6.2: Export per-chapter as separate `.md` files
- F6.3: Configurable export: include/exclude synopsis, scene breaks, chapter numbering
- F6.4: Export story bible: all characters, locations, plotlines as a reference `.md`
- F6.5: Beats stripped from all exports (clean reader output)

### F7: Content Versioning
- F7.1: Auto-versioning on save (keep last N versions per scene, configurable)
- F7.2: Version history view for any scene (timestamp + word count diff)
- F7.3: Restore a previous version (creates a new version from the old content)

### F8: AI Assistance (via Gemini)
- F8.1: Brainstorm/expand: select text or scene, ask Gemini for ideas
- F8.2: Summarize: generate synopsis for a scene or chapter from its content
- F8.3: Consistency check: ask Gemini to review scenes for character/plot consistency
- F8.4: AI results shown in a side panel; user explicitly applies or discards suggestions
- F8.5: All AI interactions are non-destructive (never auto-edit content)
- F8.6: AI inline action bar: text-selection-based brainstorm/expand/summarize

### F9: Search
- F9.1: Full-text search across all scene content
- F9.2: Search/filter story objects by name

### F10: Universe Management
- F10.1: Create, rename, delete universes
- F10.2: Link/unlink projects to/from a universe
- F10.3: CRUD for universe-scoped world objects (Characters, Locations, World Elements)
- F10.4: Timeline entries: track world object evolution with ordered events
- F10.5: Top-level Universes page alongside Dashboard

### F11: MCP Skills Architecture
- F11.1: Curated `.skills/` directory with writing skill instruction sets (Markdown)
- F11.2: Skill loader parses metadata from SKILL.md
- F11.3: Skills registered as MCP Prompts (discoverable via list_prompts)
- F11.4: `list_skills` tool returns metadata
- F11.5: 6 core skills: Developmental Edit, Line Edit, Consistency Check, Plot Structure, Character Arc, Scene Drafting

### F12: Article / Non-Fiction Support
- F12.1: Project types: FICTION, ARTICLE_COLLECTION, GENERAL
- F12.2: Dynamic UI labels (Concept/Persona vs Chapter/Character)
- F12.3: Medium-compatible Markdown export with front matter

### F13: Annotations
- F13.1: Range-based annotations on scene content (selected text + comment)
- F13.2: Resolve/unresolve annotations
- F13.3: Annotations sidebar in scene editor
- F13.4: External ID field for Google Docs comment sync import

### F14: Focus Mode
- F14.1: Dedicated distraction-free writing view per scene (`/project/[id]/scene/[sceneId]/focus`)
- F14.2: Three-panel layout: scene info (left), editor (center), related elements (right)
- F14.3: Scene navigation (prev/next) within focus mode
- F14.4: Collapsible sidebars for full-screen writing

### F15: Beats (Story Beat Markers)
- F15.1: Insert beat markers in the scene editor via toolbar button
- F15.2: Beats stored as HTML comments (`<!-- beat: ... -->`) in scene content
- F15.3: Rendered as styled divider cards in the editor
- F15.4: Preserved across save/load cycles; stripped from all exports

### F16: Google Docs Export & Bidirectional Sync
- F16.1: Export manuscript to Google Docs via OAuth2
- F16.2: Three export modes: STORY_READER (clean), STORY_INTERNAL (with beats), UNIVERSE (world-building)
- F16.3: Idempotent re-export (same doc updated, not duplicated)
- F16.4: Pull Google Docs comments back as annotations (bidirectional sync)
- F16.5: Tracks `lastSyncedAt` and `lastCommentSyncAt` per export

### F17: Medium Publishing
- F17.1: Connect Medium account via API token (encrypted storage)
- F17.2: Publish scenes or full projects to Medium (draft or published)
- F17.3: Track published posts and sync status via `MediumExport`
- F17.4: MCP tool `export_medium` for agentic publishing

### F18: Progressive Web App (PWA)
- F18.1: Installable as a PWA via Web App Manifest
- F18.2: Service worker with offline fallback page
- F18.3: Network-first caching for API routes (24h); cache-first for fonts (1 year)
- F18.4: Offline write queue (IndexedDB) — operations queued when disconnected, synced on reconnect
- F18.5: Offline indicator and sync status toast in UI

### F19: Dark Mode & Theme Support
- F19.1: Light/dark theme toggle
- F19.2: Theme preference persisted across sessions
- F19.3: Full dark-mode support across all UI components

### F20: Authentication & Role-Based Access Control
- F20.1: Google OAuth 2.0 login with JWT session cookies (30-day max age)
- F20.2: Static API_TOKEN for programmatic/MCP access
- F20.3: Dev mode with auth disabled for local development
- F20.4: Three project roles: OWNER (full control), EDITOR (read/write), READER (read-only)
- F20.5: Project sharing UI (`share-dialog.tsx`) with role assignment
- F20.6: Per-route auth enforcement via `verifyProjectAccess`

### F21: Voice Analysis (Writing Voice Monitor)
- F21.1: Analyze writing voice consistency across scenes
- F21.2: Voice monitor panel in scene editor
- F21.3: MCP tool `getVoiceContext` for agentic voice checks
- F21.4: API endpoint `GET /api/projects/[id]/voice-check`

### F22: AI Chat (Project-Aware Conversational AI)
- F22.1: Per-project streaming chat with Gemini 2.0 Flash
- F22.2: Dynamic system prompt built from project structure, story objects, and user preferences
- F22.3: Chat history (last 20 messages) maintained per project
- F22.4: Optional scene context injection for scene-specific coaching
- F22.5: Coaching styles: balanced, mentor, critic, cheerleader
- F22.6: Response lengths: brief, moderate, detailed
- F22.7: Custom system instructions per user
- F22.8: Markdown rendering with DOMPurify sanitization

### F23: Read View (Reader Mode)
- F23.1: Clean reading view without editing UI (`/read/[id]`)
- F23.2: Hierarchical display: chapters → scenes with scene break indicators
- F23.3: Shows only DRAFT and above status scenes
- F23.4: Accessible to owners, editors, and readers via RBAC

### F24: Writing Sessions & Progress Tracking
- F24.1: Auto-tracked writing sessions (start/end time, words written, duration)
- F24.2: Session history per project and per scene node
- F24.3: Activity heatmap visualization (28-day rolling window)
- F24.4: API: `GET /api/projects/[id]/sessions`, `GET /api/sessions/heatmap`

### F25: Timeline View
- F25.1: Visual horizontal timeline (`/project/[id]/timeline`)
- F25.2: X-axis: chapters/scenes; Y-axis: story objects
- F25.3: Event markers where relationships exist between objects and scenes
- F25.4: Filter by world object type; zoom between chapter and scene level
- F25.5: Click-to-navigate to scenes from timeline

### F26: Plot Thread Status Tracking
- F26.1: Track plotline status across scenes: advancing, mentioned, dormant
- F26.2: Last-seen tracking per plotline
- F26.3: MCP tool `getPlotThreadStatus` for agentic checks
- F26.4: API: `GET /api/projects/[id]/plot-thread-status`

### F27: Consistency Checking
- F27.1: Character/location continuity analysis via AI
- F27.2: Consistency alerts panel in scene editor
- F27.3: Optional scene-scoped focus for targeted checks
- F27.4: MCP tool `getConsistencyContext`

### F28: MCP Export Tools
- F28.1: `exportManuscript(projectId, options)` — Markdown with optional beats
- F28.2: `exportStoryBible(projectId)` — Character/location/plotline reference
- F28.3: `exportMedium(projectId, nodeId?)` — Medium-compatible Markdown
- F28.4: `exportUniverse(universeId)` — Universe world-building export
- F28.5: `getProjectSummary(projectId)` — Project metadata summary

### F29: Manuscript-Level AI Analysis
- F29.1: Full manuscript structure, pacing, and tone analysis
- F29.2: Character arc verification across the full manuscript
- F29.3: API: `POST /api/ai-manuscript`

### F30: Content Reporting
- F30.1: Report inappropriate content on shared projects
- F30.2: Categories: copyright, illegal, harassment, other
- F30.3: API: `POST /api/projects/[id]/report`

## Non-Functional Requirements

- **NF1**: Response time < 200ms for all local operations
- **NF2**: Works offline (AI/sync features require network; core editing is local)
- **NF3**: Database file < 100MB for a typical novel project
- **NF4**: Export produces clean, readable Markdown (no HTML artifacts)
- **NF5**: Test coverage for API routes, export logic, and editor behavior
- **NF6**: Service worker enables installable PWA and offline fallback

## Tech Stack

- **Runtime**: Node.js 20+ (inside Docker)
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript (strict mode)
- **Database**: SQLite via Prisma ORM
- **UI**: React + Tailwind CSS + shadcn/ui
- **Editor**: Tiptap (ProseMirror)
- **AI**: Gemini 2.0 Flash (API calls from API routes)
- **Agent Interface**: MCP Server (Model Context Protocol) via stdio
- **Auth**: Google OAuth 2.0 + JWT session cookies
- **Integrations**: Google Docs API (googleapis), Medium API
- **PWA**: next-pwa + Workbox service worker + IndexedDB offline queue
- **Testing**: Vitest + React Testing Library + Playwright (E2E)
- **Container**: Docker + Docker Compose
- **Monitoring**: Sentry (client + server + edge)

## Milestones

### M1: Foundation
- Project scaffolding, Docker setup, database schema
- Project CRUD + dashboard
- Basic layout (sidebar + main area)

### M2: Manuscript Structure & Editing
- Outline tree view with drag-and-drop
- Scene rich text editor with auto-save
- Word counts

### M3: Story Objects & Relationships
- CRUD for all story object types
- Relationship creation and display
- Relationship panel in scene editor

### M4: Export & Versioning
- Markdown export (full manuscript + per-chapter + story bible)
- Content version history and restore

### M5: AI Integration & Polish
- Gemini integration for brainstorming/summarization
- Full-text search
- UI polish and edge cases

### M6: MCP Server (Agentic Access)
- Standalone MCP server running inside Docker
- 40+ tools including Universe and WorldObject management
- Git-based database versioning for safety
- Full read/write access for AI agents

### M7: Universes (Completed)
- Universe data model and API
- WorldObject timeline entries
- MCP tools for world building

### M8: MCP Skills (Completed)
- Skill loader and registry
- Initial set of 6 writing skills
- Integration with MCP Prompts

### M9: Article Templates (Completed)
- Schema update for projectType
- Refactored constants for dynamic labeling
- UI updates for variable terminology
- Medium export tool

### M10: Auth & Sharing (Completed)
- Google OAuth 2.0 login
- Role-based project access (OWNER/EDITOR/READER)
- Project sharing UI

### M11: Integrations (Completed)
- Google Docs export with bidirectional comment sync
- Medium publishing with encrypted credential storage
- PWA with offline queue and service worker

### M12: Writing Coach AI (Completed)
- Project-aware AI chat (streaming, per-project context)
- Voice analysis and consistency checking
- Plot thread status tracking
- Writing sessions and progress heatmap

### M13: Beats & Focus Mode (Completed)
- Beat markers in scene editor (toolbar + keyboard shortcut)
- HTML comment storage, preserved on save, stripped on export
- Focus mode (distraction-free three-panel view)
- Read view for clean chapter/scene display
- Annotations with range-based comments and Google Docs sync
- Timeline view for visual story mapping
