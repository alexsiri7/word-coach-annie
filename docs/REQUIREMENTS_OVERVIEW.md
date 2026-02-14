# Word Coach Annie - Requirements Overview

Word Coach Annie is a local-first, distraction-free writing tool for novelists, focusing on hierarchical structure, story object management, and AI-assisted brainstorming.

## Primary Requirements

### 1. Project & Structure Management
- Create and manage writing projects with persistent SQLite storage.
- Hierarchical manuscript organization: **Parts > Chapters > Scenes**.
- Scene editor with rich text support (Tiptap).
- Word count tracking at project and scene levels.

### 2. Story Objects & Relationships
- Manage **Characters, Locations, Plotlines, World Elements, and Notes**.
- Create typed relationships between any entities (e.g., "Character X APPEARS_IN Scene Y").
- Link story objects directly to scene context.

### 3. Content Safety & Versioning
- Automatic versioning of scene content on save.
- Version history view and full restoration capabilities.
- Version pruning (maintaining last 50 versions).

### 4. Agentic Interaction (MCP)
- Full project access for AI agents via Model Context Protocol (MCP).
- Tools for automated CRUD, structure manipulation, and export.
- Git-based database snapshots for safe agentic edits.

### 5. Export & Search
- Full manuscript export to clean Markdown.
- Per-chapter and Story Bible export.
- Full-text search across all content.

---
*For detailed specifications, see [REQUIREMENTS.md](REQUIREMENTS.md).*
