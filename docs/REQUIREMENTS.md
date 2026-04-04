# Word Coach Annie - Requirements & Implemented Features

## Vision

A local-first fiction writing and book management tool for novelists. Manages the
complex web of data behind a long-form narrative (structure, characters, locations,
plotlines, relationships) and provides AI coaching, integrations, and export tools.
Runs as a web app (self-hosted or Railway-deployed) with full PWA support.

## Core Principles

- **Local-first**: Runs on your machine or self-hosted. No required cloud accounts.
- **SQLite**: Single portable database file. Easy to backup, version, or move.
- **Markdown export**: Clean `.md` output ready for beta readers or publishing tools.
- **AI-assisted**: OpenAI-compatible API for brainstorming, analysis, and coaching.
- **MCP Server**: Provides direct CLI access to project data for AI agents.
- **PWA**: Installable as a standalone app with offline support.

## Data Model

### Project
- A single writing project (e.g., one novel or article collection)
- Has a title, author name, synopsis, genre, project type (FICTION, ARTICLE_COLLECTION, GENERAL)
- Contains all structure nodes, story objects, and their relationships

### Structure Nodes (Hierarchical)
- **Part** (optional top-level grouping)
- **Chapter** (contains scenes)
- **Scene** (the atomic unit of writing)
- Each has: title, synopsis, status (Outline/Draft/Revised/Final), order index
- Scenes have: rich text content, word count (auto-calculated), beat annotations

### Story Objects
- **Character**: name, description, notes, role (protagonist/antagonist/supporting/minor)
- **Location**: name, description, notes
- **Plotline**: title, description, notes, status (advancing/dormant/mentioned)
- **World Element**: name, description, notes (magic systems, factions, tech, etc.)
- **Note**: title, content (general-purpose scratchpad)
- All types share: created/updated timestamps, custom tags

### Relationships
- Link any two entities (structure nodes or story objects) together
- Typed relationships: APPEARS_IN, LOCATED_AT, PART_OF_PLOTLINE, RELATED_TO, etc.
- Optional label/description on each relationship
- Examples: "Alice APPEARS_IN Chapter 3 Scene 2", "Tavern LOCATED_AT Kingdom of Eld"

### Universes
- **Universe**: High-level container for shared world-building (optional)
- **WorldObject**: Universe-scoped entity (CHARACTER, LOCATION, WORLD_ELEMENT) with timeline entries
- **WorldObjectTimelineEntry**: Ordered events tracking how a world object evolves over time
- Characters/Locations/WorldElements can be shared across projects within a universe

### Content Versioning
- Scene content is versioned: each save creates a new version
- Can view history and restore previous versions
- Lightweight: just timestamp + content snapshots per scene

### Annotations
- Inline annotations on selected text (highlighted with underline)
- Resolved/unresolved status tracking
- Text range tracking
- Synced from Google Docs comments (bidirectional)

### Writing Sessions
- Writing activity tracked per day with word counts
- Used for activity heatmap visualization

## Functional Requirements

### F1: Project Management
- F1.1: Create, rename, delete projects
- F1.2: Dashboard showing all projects with last-modified date and word count
- F1.3: Project settings (title, author, synopsis, genre, project type)
- F1.4: Archive projects
- F1.5: Project sharing (invite by email with READER role)
- F1.6: Sample project creation (onboarding)

### F2: Manuscript Structure
- F2.1: Hierarchical outline view (sidebar tree: Parts > Chapters > Scenes)
- F2.2: Create/rename/delete structure nodes
- F2.3: Drag-and-drop reordering of nodes within and between parents
- F2.4: Scene status indicators in the outline (color-coded by status)

### F3: Scene Editing
- F3.1: Rich text editor for scene content (bold, italic, underline, highlight, links, headings, lists)
- F3.2: Auto-save on edit (debounced, creates content versions)
- F3.3: Scene metadata panel (synopsis, status, word count)
- F3.4: Word count per scene and total project word count
- F3.5: Beat annotations (inline story structure notes stored as HTML comments, toggled in read view)
- F3.6: Inline AI actions: rewrite-tighter, rewrite-vivid, rewrite-simpler, continue, expand, voice-check, ask

### F4: Story Object Management
- F4.1: CRUD for Characters, Locations, Plotlines, World Elements, Notes
- F4.2: List/filter story objects by type
- F4.3: Detail view with description and notes (rich text)
- F4.4: Quick-link story objects to scenes from the editor sidebar
- F4.5: Dynamic UI labels based on project type (e.g., Concept/Persona for articles)

### F5: Relationship Management
- F5.1: Create/delete typed relationships between any entities
- F5.2: View relationships for any entity ("Alice appears in: Scene 1, Scene 5, Scene 12")
- F5.3: Relationship panel in scene editor showing linked characters/locations/plotlines
- F5.4: Story graph visualization (interactive node/edge graph)

### F6: Export
- F6.1: Export full manuscript as single `.md` file (front matter + parts/chapters/scenes)
- F6.2: Export per-chapter as separate `.md` files
- F6.3: Configurable export: include/exclude synopsis, scene breaks, chapter numbering
- F6.4: Export story bible: all characters, locations, plotlines as a reference `.md`
- F6.5: JSON export (full project data)
- F6.6: Batch export all projects
- F6.7: Export to Google Docs (manuscript + story bible)
- F6.8: Publish to Hashnode (scenes/chapters as blog posts)

### F7: Content Versioning
- F7.1: Auto-versioning on save (keep all versions per scene)
- F7.2: Version history view for any scene (timestamp + word count)
- F7.3: Restore a previous version (creates a new version from the old content)

### F8: AI Assistance
- F8.1: Chat with Annie (AI writing coach with project context awareness)
- F8.2: Manuscript-level analysis: plot-thread analysis, character-arc tracking, consistency-checking
- F8.3: Inline text actions accessible from the editor
- F8.4: AI results shown in side panel; user explicitly applies or discards suggestions
- F8.5: All AI interactions are non-destructive (never auto-edit content without user action)
- F8.6: Configurable AI provider (OpenAI-compatible API endpoint, model selection)
- F8.7: AI preference settings (coaching style, response length, custom instructions)

### F9: Search
- F9.1: Full-text search across all scene content (with snippet preview)
- F9.2: Search/filter story objects by name and description
- F9.3: Returns result type (scene vs story object) with parent context

### F10: Universe Management
- F10.1: Create, rename, delete universes
- F10.2: Link/unlink projects to/from a universe
- F10.3: CRUD for universe-scoped world objects (Characters, Locations, World Elements)
- F10.4: Timeline entries: track world object evolution with ordered events
- F10.5: Top-level Universes page alongside Dashboard
- F10.6: Transfer world objects between projects
- F10.7: Copy world objects into a project

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

### F13: Read View
- F13.1: Full manuscript reader view (all scenes in order)
- F13.2: Table of Contents (parts, chapters, clickable navigation)
- F13.3: Reading time estimate (~250 wpm)
- F13.4: Scene breaks with HR separator between scenes
- F13.5: Beat annotations stripped from reader output
- F13.6: Theme toggle in read view
- F13.7: OUTLINE-status scenes excluded from read view

### F14: Focus Mode
- F14.1: Dedicated full-screen view for single scene
- F14.2: Scene metadata: title, synopsis, status, word count
- F14.3: Chapter/part context
- F14.4: Previous/next scene navigation
- F14.5: Related elements panel (characters, locations, plotlines, world elements, notes)
- F14.6: Annotations visible in context

### F15: Progress & Analytics
- F15.1: Scene status breakdown (OUTLINE, DRAFT, REVISED, FINAL counts + percentages)
- F15.2: Writing activity heatmap (GitHub-style contribution graph)
- F15.3: Total word count and per-status word counts
- F15.4: Project progress dashboard with visual indicators
- F15.5: Per-scene word counts and history

### F16: Annotations
- F16.1: Inline annotations on selected text (yellow highlight with underline)
- F16.2: Resolved/unresolved status tracking
- F16.3: Annotations sidebar per scene
- F16.4: Open annotations view (all unresolved across project)
- F16.5: Google Docs comment sync (import comments as annotations)

### F17: Google Docs Integration
- F17.1: Export manuscript and story bible to Google Docs
- F17.2: Pull Google Docs comments as annotations (bidirectional sync)
- F17.3: Track exported documents per project
- F17.4: Google OAuth authentication

### F18: Hashnode Integration
- F18.1: Connect Hashnode account via Personal Access Token
- F18.2: Publish scenes/chapters as Hashnode articles
- F18.3: Options: title, publish status (draft/public/unlisted), tags, canonical URL
- F18.4: Duplicate publication detection
- F18.5: Track published articles per project

### F19: PWA & Offline Support
- F19.1: Installable as standalone PWA (display: standalone)
- F19.2: Offline writing capability with sync queue
- F19.3: Service worker with Workbox caching (network-first API, cache-first assets)
- F19.4: In-app update notification when new version available
- F19.5: Offline indicator component
- F19.6: IndexedDB for local persistence

### F20: Dark Mode
- F20.1: Light/dark theme toggle
- F20.2: Persists user preference
- F20.3: Applied across all UI surfaces including read view

### F21: Authentication & Access Control
- F21.1: Google OAuth login
- F21.2: Project sharing with READER role
- F21.3: Per-user AI settings

### F22: Timeline View
- F22.1: Project-wide timeline visualization
- F22.2: World object timeline entries (ordered events)
- F22.3: Timeline entry reordering

### F23: Consistency & Voice Analysis
- F23.1: Consistency alert panel
- F23.2: Character arc tracking across manuscript
- F23.3: Voice consistency checking (sentence rhythm, word choice, POV shifts)
- F23.4: Plot thread status tracking (advancing/dormant/mentioned per plotline)

## Non-Functional Requirements

- **NF1**: Response time < 200ms for all local operations
- **NF2**: Works offline (AI features require network, everything else is local)
- **NF3**: Database file < 100MB for a typical novel project
- **NF4**: Export produces clean, readable Markdown (no HTML artifacts)
- **NF5**: Test coverage for API routes and export logic

## Tech Stack

- **Runtime**: Node.js 20+ (inside Docker or Railway)
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript (strict mode)
- **Database**: SQLite via Prisma ORM
- **UI**: React + Tailwind CSS + shadcn/ui
- **Editor**: Tiptap (ProseMirror-based)
- **AI**: OpenAI-compatible API (configurable endpoint + model)
- **Agent Interface**: MCP Server (Model Context Protocol) via stdio
- **Testing**: Vitest + React Testing Library + Playwright (E2E)
- **Container**: Docker + Docker Compose
- **Deployment**: Railway (staging + production)
- **Offline**: Workbox service worker + IndexedDB

## Milestones

### M1–M5: Foundation through AI Integration (Completed)
- Project scaffolding, Docker setup, database schema
- Outline tree view with drag-and-drop
- Scene rich text editor with auto-save
- CRUD for all story object types
- Relationship creation and display
- Markdown export (full manuscript + per-chapter + story bible)
- Content version history and restore
- AI integration for brainstorming/summarization
- Full-text search

### M6: MCP Server (Completed)
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
- Medium/Hashnode export tooling

### M10: Integrations & Publishing (Completed)
- Google Docs export + bidirectional comment sync as annotations
- Hashnode publishing integration

### M11: Reader, Focus Mode & Analytics (Completed)
- Read view with HR separators, TOC, reading time
- Focus mode (distraction-free per-scene view)
- Progress dashboard with writing heatmap
- Dark mode

### M12: PWA & Offline (Completed)
- Service worker with Workbox
- Offline writing queue
- Installable standalone app
- In-app update notifications
