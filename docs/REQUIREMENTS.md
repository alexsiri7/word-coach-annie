# Word Coach Annie - Local Edition

## Vision

A local-first fiction writing and book management tool for novelists. Manages the
complex web of data behind a long-form narrative (structure, characters, locations,
plotlines, relationships) and exports clean Markdown for distribution to beta readers.

## Core Principles

- **Local-first**: Everything runs on your machine. No cloud, no accounts, no subscriptions.
- **SQLite**: Single portable database file. Easy to backup, version, or move.
- **Markdown export**: The primary output is a clean `.md` file ready for readers.
- **AI-assisted via Gemini CLI**: Uses your existing Gemini quota for brainstorming, analysis, and drafting assistance.
- **MCP Server**: Provides direct CLI access to project data for AI agents.
- **Docker-contained**: Runs in a container so it can't mess with your system.

## Data Model

### Project
- A single writing project (e.g., one novel)
- Has a title, author name, synopsis, genre
- Contains all structure nodes, story objects, and their relationships

### Structure Nodes (Hierarchical)
- **Part** (optional top-level grouping)
- **Chapter** (contains scenes)
- **Scene** (the atomic unit of writing)
- Each has: title, synopsis, status (Outline/Draft/Revised/Final), order index
- Scenes have: rich text content, word count (auto-calculated)

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
- Examples: "Alice APPEARS_IN Chapter 3 Scene 2", "Tavern LOCATED_AT Kingdom of Eld"

### Universes
- **Universe**: High-level container for shared world-building (optional)
- **WorldObject**: Renamed from StoryObject when scoped to a Universe (CHARACTER, LOCATION, WORLD_ELEMENT)
- **WorldObjectTimelineEntry**: Ordered events tracking how a world object evolves over time
- Note: Characters/Locations/WorldElements are now primarily Universe-scoped entities linked to projects.

### Content Versioning
- Scene content is versioned: each save creates a new version
- Can view history and restore previous versions
- Lightweight: just timestamp + content snapshots per scene

## Functional Requirements

### F1: Project Management
- F1.1: Create, rename, delete projects
- F1.2: Dashboard showing all projects with last-modified date and word count
- F1.3: Project settings (title, author, synopsis, genre)

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

### F7: Content Versioning
- F7.1: Auto-versioning on save (keep last N versions per scene, configurable)
- F7.2: Version history view for any scene (timestamp + word count diff)
- F7.3: Restore a previous version (creates a new version from the old content)

### F8: AI Assistance (via Gemini CLI)
- F8.1: Brainstorm/expand: select text or scene, ask Gemini for ideas
- F8.2: Summarize: generate synopsis for a scene or chapter from its content
- F8.3: Consistency check: ask Gemini to review scenes for character/plot consistency
- F8.4: AI results shown in a side panel; user explicitly applies or discards suggestions
- F8.5: All AI interactions are non-destructive (never auto-edit content)

### F9: Search
- F9.1: Full-text search across all scene content
- F9.2: Search/filter story objects by name

### F10: Universe Management (Implemented)
- F10.1: Create, rename, delete universes
- F10.2: Link/unlink projects to/from a universe
- F10.3: CRUD for universe-scoped world objects (Characters, Locations, World Elements)
- F10.4: Timeline entries: track character evolution with ordered events
- F10.5: Top-level Universes page alongside Dashboard

### F11: MCP Skills Architecture (Implemented)
- F11.1: Curated `.skills/` directory with writing skill instruction sets (Markdown)
- F11.2: Skill loader parses metadata from SKILL.md
- F11.3: Skills registered as MCP Prompts (discoverable via list_prompts)
- F11.4: `list_skills` tool returns metadata
- F11.5: 6 core skills: Developmental Edit, Line Edit, Consistency Check, Plot Structure, Character Arc, Scene Drafting

## Non-Functional Requirements

- **NF1**: Response time < 200ms for all local operations
- **NF2**: Works offline (AI features require network, everything else is local)
- **NF3**: Database file < 100MB for a typical novel project
- **NF4**: Export produces clean, readable Markdown (no HTML artifacts)
- **NF5**: Test coverage for API routes and export logic

## Tech Stack

- **Runtime**: Node.js 20+ (inside Docker)
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript (strict mode)
- **Database**: SQLite via Prisma ORM
- **UI**: React + Tailwind CSS + shadcn/ui
- **Editor**: Tiptap (ProseMirror)
- **AI**: Gemini CLI (subprocess calls from API routes)
- **Agent Interface**: MCP Server (Model Context Protocol) via stdio
- **Testing**: Vitest + React Testing Library
- **Container**: Docker + Docker Compose

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
- Gemini CLI integration for brainstorming/summarization
- Full-text search
- UI polish and edge cases

### M6: MCP Server (Agentic Access)
- Standalone MCP server running inside Docker
- 40+ tools including Universe and WorldObject management
- Git-based database versioning for safety
- Full read/write access for Gemini CLI agents

### M7: Universes (Completed)
- Universe data model and API
- WorldObject timeline entries
- MCP tools for world building

### M8: MCP Skills (Completed)
- Skill loader and registry
- Initial set of 6 writing skills
- Integration with MCP Prompts
