# MCP Server Reference

Annie exposes a Model Context Protocol (MCP) server with **71 tools** and **16 prompts** for full read/write access to all project data.

## Connection

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "word-coach-annie": {
      "command": "docker",
      "args": ["compose", "exec", "-T", "app", "npx", "tsx", "src/mcp/index.ts"],
      "cwd": "/path/to/word-coach-annie"
    }
  }
}
```

### HTTP Transport (Web Clients)

Use the HTTP proxy at `POST /api/mcp` (JSON-RPC). See [API.md](API.md) for details.

### Authentication

Set `API_TOKEN` in your environment. MCP clients must send `Authorization: Bearer <API_TOKEN>`.

To enable destructive tools (delete, restore_snapshot, etc.), set `MCP_ALLOW_DESTRUCTIVE=true`.

---

## Stale-Write Protection

Read-modify-write tools require a `contentHash` from the corresponding read call. This prevents accidental overwrites when two agents or sessions edit the same data concurrently. Always:

1. Read the resource (`get_project`, `read_scene_content`, `get_story_object`, etc.)
2. Use the returned `contentHash` in your write call
3. If you get a hash mismatch error, re-read and try again

---

## Tools

### Projects

#### `list_projects`
List all writing projects with word counts and metadata.

| Param | Type | Description |
|-------|------|-------------|
| `limit` | number? | Max projects to return (default 20) |
| `offset` | number? | Pagination offset |

---

#### `get_project`
Get a single project's details by ID.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |

Returns project object including `contentHash` for stale-write protection.

---

#### `create_project`
Create a new writing project.

| Param | Type | Description |
|-------|------|-------------|
| `title` | string | Project title |
| `author` | string? | Author name |
| `synopsis` | string? | Project synopsis |
| `genre` | string? | Genre |

---

#### `update_project`
Update a project's metadata.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |
| `contentHash` | string | Hash from `get_project` |
| `title` | string? | New title |
| `author` | string? | New author name |
| `synopsis` | string? | New synopsis |
| `genre` | string? | New genre |

---

#### `get_project_summary`
Get a structured overview: metadata, node counts by type/status, story object counts, total word count.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |

---

#### `link_project_to_universe`
Link a project to a universe.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |
| `universeId` | string | The universe ID |

---

#### `unlink_project_from_universe`
Remove a project's universe link.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |

---

#### `transfer_story_object_to_universe`
Transfer a project story object into a universe as a world object.

| Param | Type | Description |
|-------|------|-------------|
| `storyObjectId` | string | The story object ID |
| `universeId` | string | The target universe ID |

---

### Structure & Outline

#### `get_outline`
Get the full hierarchical manuscript outline (parts → chapters → scenes) with word counts and statuses.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |

---

#### `create_node`
Create a new structure node (PART, CHAPTER, or SCENE).

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |
| `type` | enum | `PART`, `CHAPTER`, or `SCENE` |
| `title` | string | Node title |
| `parentId` | string? | Parent node ID |
| `synopsis` | string? | Brief synopsis |
| `status` | enum? | `OUTLINE`, `DRAFT`, `REVISED`, `FINAL` (default: OUTLINE) |
| `insertAfterIndex` | number? | Insert after this order index |

---

#### `update_node`
Update a structure node's title, synopsis, status, order, or parent.

| Param | Type | Description |
|-------|------|-------------|
| `nodeId` | string | The node ID |
| `contentHash` | string | Hash from `get_outline` |
| `title` | string? | New title |
| `synopsis` | string? | New synopsis |
| `status` | enum? | New status |
| `orderIndex` | number? | New order index |
| `parentId` | string\|null? | New parent (null = top-level) |

---

#### `delete_node`
Delete a structure node and all children, content, and relationships. Auto-snapshots before deletion. Requires `MCP_ALLOW_DESTRUCTIVE=true`.

| Param | Type | Description |
|-------|------|-------------|
| `nodeId` | string | The node ID to delete |

---

#### `batch_create_nodes`
Create multiple nodes in one operation (max 50). Nodes are created sequentially so earlier entries can be parents for later ones.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |
| `nodes` | array | Array of `{ type, title, parentId?, synopsis?, status? }` |

---

#### `batch_update_nodes`
Update multiple nodes in one operation (max 50).

| Param | Type | Description |
|-------|------|-------------|
| `updates` | array | Array of `{ nodeId, title?, synopsis?, status?, orderIndex?, parentId? }` |

---

#### `batch_delete_nodes`
Delete multiple nodes in one operation (max 50). Auto-snapshots before deletion. Requires `MCP_ALLOW_DESTRUCTIVE=true`.

| Param | Type | Description |
|-------|------|-------------|
| `nodeIds` | string[] | Array of node IDs to delete |

---

### Scene Content

#### `read_scene_content`
Read the latest content of a scene (HTML), word count, annotations, and `contentHash`.

| Param | Type | Description |
|-------|------|-------------|
| `nodeId` | string | The scene node ID |

---

#### `write_scene_content`
Write new content to a scene. Provide `content` (HTML) or `blocks` (structured beat array). Annie should ONLY use `blocks` with type `BEAT`.

| Param | Type | Description |
|-------|------|-------------|
| `nodeId` | string | The scene node ID |
| `contentHash` | string | Hash from `read_scene_content` |
| `content` | string? | HTML content |
| `blocks` | array? | `[{ type: "CONTENT"\|"BEAT", content: string }]` |

---

#### `update_paragraph`
Patch a single paragraph or beat within a scene by its index. Requires `paragraphContentHash`
to prevent stale overwrites. Use `intent: "editorial"` when correcting the author's existing
words (typos, punctuation, wording fixes) rather than replacing them with AI-generated prose.

| Param | Type | Description |
|-------|------|-------------|
| `nodeId` | string | The scene node ID |
| `index` | number | The paragraph index from the paragraphs array |
| `content` | string | New content for this paragraph (must match existing type: CONTENT or BEAT) |
| `paragraphContentHash` | string | The `contentHash` from `paragraphs[index]` in `read_scene_content` |
| `sceneContentHash` | string? | Optional scene-level hash for additional stale protection |
| `intent` | `"editorial"` \| `"creative"` | Optional. `"editorial"` signals the author's words are being corrected — prose-writing guard does not apply. Omit or use `"creative"` for standard behavior. |

---

#### `get_scene_versions`
List version history of a scene (timestamps and word counts).

| Param | Type | Description |
|-------|------|-------------|
| `nodeId` | string | The scene node ID |
| `limit` | number? | Max versions (default 20) |

---

#### `restore_scene_version`
Restore a previous scene version (creates a new version from old content).

| Param | Type | Description |
|-------|------|-------------|
| `nodeId` | string | The scene node ID |
| `versionId` | string | The version ID to restore |

---

### Annotations

#### `add_annotation`
Add an annotation to a node.

| Param | Type | Description |
|-------|------|-------------|
| `nodeId` | string | The node ID |
| `content` | string | Annotation text |
| `range` | string? | Text range (JSON) |
| `selectedText` | string? | The selected text |

---

#### `update_annotation`
Update an existing annotation.

| Param | Type | Description |
|-------|------|-------------|
| `annotationId` | string | The annotation ID |
| `content` | string? | New text |
| `resolved` | boolean? | Mark resolved/unresolved |

---

#### `delete_annotation`
Delete an annotation. Requires `MCP_ALLOW_DESTRUCTIVE=true`.

| Param | Type | Description |
|-------|------|-------------|
| `annotationId` | string | The annotation ID |

---

#### `resolve_annotation`
Resolve or unresolve an annotation.

| Param | Type | Description |
|-------|------|-------------|
| `annotationId` | string | The annotation ID |
| `resolved` | boolean | New resolved state |

---

#### `get_open_annotations`
Get all unresolved annotations, optionally filtered by project.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string? | Filter to a specific project |

---

### Story Objects

#### `list_story_objects`
List story objects with optional filtering.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |
| `type` | enum? | `CHARACTER`, `LOCATION`, `PLOTLINE`, `WORLD_ELEMENT`, `NOTE` |
| `search` | string? | Search by name (case-insensitive contains) |
| `limit` | number? | Max objects (default 50) |
| `offset` | number? | Pagination offset |

---

#### `get_story_object`
Get a single story object with all details and relationships.

| Param | Type | Description |
|-------|------|-------------|
| `objectId` | string | The story object ID |

---

#### `create_story_object`
Create a new story object.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |
| `type` | enum | `CHARACTER`, `LOCATION`, `PLOTLINE`, `WORLD_ELEMENT`, `NOTE` |
| `name` | string | Object name |
| `description` | string? | Description |
| `notes` | string? | Additional notes |
| `role` | string? | Role (for characters: protagonist, antagonist, supporting, minor) |
| `tags` | string? | Comma-separated tags |

---

#### `update_story_object`
Update a story object's fields.

| Param | Type | Description |
|-------|------|-------------|
| `objectId` | string | The story object ID |
| `contentHash` | string | Hash from `get_story_object` |
| `name` | string? | New name |
| `description` | string? | New description |
| `notes` | string? | New notes |
| `role` | string\|null? | New role (null to clear) |
| `tags` | string? | New comma-separated tags |

---

#### `delete_story_object`
Delete a story object and all relationships. Auto-snapshots. Requires `MCP_ALLOW_DESTRUCTIVE=true`.

| Param | Type | Description |
|-------|------|-------------|
| `objectId` | string | The story object ID |

---

#### `batch_create_story_objects`
Create multiple story objects in one operation (max 50).

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |
| `objects` | array | Array of `{ type, name, description?, notes?, role?, tags? }` |

---

#### `batch_update_story_objects`
Update multiple story objects in one operation (max 50).

| Param | Type | Description |
|-------|------|-------------|
| `updates` | array | Array of `{ objectId, name?, description?, notes?, role?, tags? }` |

---

#### `batch_delete_story_objects`
Delete multiple story objects in one operation (max 50). Auto-snapshots. Requires `MCP_ALLOW_DESTRUCTIVE=true`.

| Param | Type | Description |
|-------|------|-------------|
| `objectIds` | string[] | Array of story object IDs |

---

### Relationships

#### `list_relationships`
List all relationships in a project.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |

---

#### `create_relationship`
Create a typed relationship between two entities. Provide exactly one from-field and one to-field.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID (for validation) |
| `type` | enum | `APPEARS_IN`, `LOCATED_AT`, `PART_OF_PLOTLINE`, `RELATED_TO`, `INTERACTS_WITH`, `CONTAINS`, `PRECEDES`, `FOLLOWS` |
| `fromNodeId` | string? | Source structure node ID |
| `fromObjectId` | string? | Source story object ID |
| `toNodeId` | string? | Target structure node ID |
| `toObjectId` | string? | Target story object ID |
| `label` | string? | Optional label/description |

---

#### `delete_relationship`
Delete a relationship. Auto-snapshots. Requires `MCP_ALLOW_DESTRUCTIVE=true`.

| Param | Type | Description |
|-------|------|-------------|
| `relationshipId` | string | The relationship ID |

---

### Export

#### `export_manuscript`
Export the full manuscript as Markdown (front matter + parts/chapters/scenes).

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |

---

#### `export_story_bible`
Export the story bible as Markdown (all characters, locations, plotlines, world elements, relationships).

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |

---

#### `export_hashnode`
Export a specific node or the entire project in Hashnode-ready Markdown with front matter.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |
| `nodeId` | string? | Specific node ID to export (omit to export all) |

---

### Database Safety

#### `snapshot_database`
Create a named snapshot (git commit) of the database. Use before significant changes.

| Param | Type | Description |
|-------|------|-------------|
| `message` | string | Description of what's changing or why |

---

#### `list_snapshots`
List recent database snapshots with timestamps and messages.

| Param | Type | Description |
|-------|------|-------------|
| `limit` | number? | Max snapshots (default 20) |

---

#### `restore_snapshot`
Restore the database to a previous snapshot. Requires `MCP_ALLOW_DESTRUCTIVE=true`.

| Param | Type | Description |
|-------|------|-------------|
| `commitHash` | string | Snapshot commit hash from `list_snapshots` |

---

### Universes

#### `list_universes`
List all universes.

No parameters.

---

#### `get_universe`
Get a universe by ID with world objects and linked projects.

| Param | Type | Description |
|-------|------|-------------|
| `universeId` | string | The universe ID |

---

#### `create_universe`
Create a new universe.

| Param | Type | Description |
|-------|------|-------------|
| `title` | string | Universe title |
| `description` | string? | Universe description |

---

#### `update_universe`
Update a universe's metadata.

| Param | Type | Description |
|-------|------|-------------|
| `universeId` | string | The universe ID |
| `contentHash` | string | Hash from `get_universe` |
| `title` | string? | New title |
| `description` | string? | New description |

---

#### `delete_universe`
Delete a universe and all world objects. Requires `MCP_ALLOW_DESTRUCTIVE=true`.

| Param | Type | Description |
|-------|------|-------------|
| `universeId` | string | The universe ID |

---

#### `list_world_objects`
List world objects in a universe.

| Param | Type | Description |
|-------|------|-------------|
| `universeId` | string | The universe ID |
| `type` | string? | Filter by `CHARACTER`, `LOCATION`, or `WORLD_ELEMENT` |

---

#### `get_world_object`
Get a world object by ID with its full timeline.

| Param | Type | Description |
|-------|------|-------------|
| `objectId` | string | The world object ID |

---

#### `create_world_object`
Create a new world object in a universe.

| Param | Type | Description |
|-------|------|-------------|
| `universeId` | string | The universe ID |
| `type` | enum | `CHARACTER`, `LOCATION`, or `WORLD_ELEMENT` |
| `name` | string | Object name |
| `description` | string? | Description |
| `notes` | string? | Additional notes |
| `tags` | string? | Comma-separated tags |

---

#### `update_world_object`
Update a world object's fields.

| Param | Type | Description |
|-------|------|-------------|
| `objectId` | string | The world object ID |
| `contentHash` | string | Hash from `get_world_object` |
| `name` | string? | New name |
| `description` | string? | New description |
| `notes` | string? | New notes |
| `tags` | string? | New tags |
| `type` | string? | New type |

---

#### `delete_world_object`
Delete a world object and its timeline. Requires `MCP_ALLOW_DESTRUCTIVE=true`.

| Param | Type | Description |
|-------|------|-------------|
| `objectId` | string | The world object ID |

---

#### `add_timeline_entry`
Add a state-history entry to a world object's timeline (e.g. "Year 12 — apprenticed to blacksmith").

| Param | Type | Description |
|-------|------|-------------|
| `worldObjectId` | string | The world object ID |
| `label` | string | Period or event label (e.g. "Year 12", "Post-War") |
| `description` | string? | What is true about this object at this point |
| `attributes` | string? | JSON blob for structured data |
| `projectId` | string? | Optional project this entry relates to |
| `orderIndex` | number? | Order index (appends to end if omitted) |

---

#### `update_timeline_entry`
Update a world object's timeline entry.

| Param | Type | Description |
|-------|------|-------------|
| `entryId` | string | The entry ID |
| `contentHash` | string | Hash for this entry from `get_world_object` |
| `label` | string? | New period or event label |
| `description` | string? | Updated description |
| `attributes` | string? | New JSON blob |
| `orderIndex` | number? | New order index |

---

#### `delete_timeline_entry`
Delete a timeline entry. Requires `MCP_ALLOW_DESTRUCTIVE=true`.

| Param | Type | Description |
|-------|------|-------------|
| `entryId` | string | The entry ID |

---

#### `reorder_timeline_entries`
Reorder all timeline entries for a world object.

| Param | Type | Description |
|-------|------|-------------|
| `worldObjectId` | string | The world object ID |
| `orderedIds` | string[] | All entry IDs in the desired order |

---

### Google Auth & Docs Export

#### `google_auth_status`
Check if Google credentials are configured and valid.

No parameters.

---

#### `google_auth_connect`
Initiate OAuth flow; returns auth URL for the user to visit.

No parameters.

---

#### `google_auth_callback`
Complete OAuth flow with the authorization code.

| Param | Type | Description |
|-------|------|-------------|
| `code` | string | Authorization code from the redirect URL |

---

#### `google_auth_disconnect`
Revoke and delete stored Google credentials. Requires `MCP_ALLOW_DESTRUCTIVE=true`.

No parameters.

---

#### `export_to_google_docs`
Export/sync a project or universe to Google Docs. Creates or updates a document.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string? | Project ID (for STORY_READER/STORY_INTERNAL modes) |
| `universeId` | string? | Universe ID (for UNIVERSE mode) |
| `exportMode` | enum | `UNIVERSE`, `STORY_INTERNAL`, or `STORY_READER` |

---

### Session Setup

#### `get_initial_instructions`
Returns static guidelines for how Claude should collaborate with Annie. Call this at the
start of a session to establish the correct collaboration model.

No parameters.

Returns a markdown string covering:
- Claude's role as a structural collaborator (not co-author)
- When to default to beats, annotations, and editorial flags over prose
- When to write prose (author's explicit request)
- Correct tool usage for beats and editorial corrections
- Stale-write protection reminder

---

### Coaching & Analysis

#### `get_plot_thread_status`
Track plotline engagement across scenes. Shows which threads are advancing, newly mentioned, or dormant.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |

---

#### `get_scene_focus`
Get complete context for coaching a single scene: metadata, status, word count, adjacent scenes, linked elements, and open annotations.

| Param | Type | Description |
|-------|------|-------------|
| `sceneId` | string | The scene node ID |

---

#### `get_manuscript_context`
Get full manuscript context for analysis: outline with scene previews, character profiles, plotline summaries, and relationships.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |

---

#### `get_consistency_context`
Gather character profiles and scene text for consistency analysis. Optionally focus on one scene.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |
| `sceneId` | string? | Focus on a specific scene (otherwise checks up to 20 scenes) |

---

#### `cross_reference_story_bible`
Cross-reference prose content against story object definitions to find attribute mismatches, behavioural inconsistencies, and timeline contradictions.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |
| `sceneId` | string? | Focus on a specific scene (otherwise checks up to 15 scenes) |

---

#### `get_voice_context`
Gather character profiles and scene dialogue for voice consistency analysis.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |
| `sceneId` | string | The scene to analyze |

---

### Writing Tasks

#### `list_writing_tasks`
List writing tasks for a project, with optional filtering.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project to list tasks for |
| `completed` | boolean? | Filter by completion status |
| `energy` | `"Introspective" \| "Dramatic" \| "Technical"`? | Filter by energy type — key dimension for mood-matched task selection |
| `importance` | `"Critical" \| "High" \| "Medium"`? | Filter by importance |
| `size` | `"Large" \| "Medium" \| "Small"`? | Filter by size |

Returns `{ tasks: WritingTask[], total: number }`.

---

#### `create_writing_task`
Create a new writing task for a project, optionally linked to a scene.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project to attach the task to |
| `name` | string | Task name (required, non-empty) |
| `whatIsNeeded` | string? | Two sentences max — enough context to remember the idea |
| `importance` | `"Critical" \| "High" \| "Medium"`? | Priority level (default `"Medium"`) |
| `size` | `"Large" \| "Medium" \| "Small"`? | Effort size (default `"Medium"`) |
| `energy` | `"Introspective" \| "Dramatic" \| "Technical"`? | Energy type required (default `"Technical"`) |
| `sceneId` | string? | Optional scene (StructureNode) to associate the task with |

Returns the created `WritingTask` object.

---

#### `complete_writing_task`
Mark a writing task as completed.

| Param | Type | Description |
|-------|------|-------------|
| `taskId` | string | The task ID to mark complete |

Returns the updated `WritingTask` with `completed: true`.

---

### Skills

#### `list_skills`
List all available writing skills (structured instruction sets). Use `get_prompt` to invoke a skill.

No parameters.

---

## Prompts

MCP Prompts are invokable via `get_prompt` and return a pre-built message ready for the AI.

### Built-in Prompts

#### `review`
Status-aware scene review — automatically routes to the right skill:
- OUTLINE → `outline-review`
- DRAFT → `developmental-edit`
- REVISED → `line-edit`
- FINAL → `consistency-check`

| Param | Type | Description |
|-------|------|-------------|
| `sceneId` | string | The scene node ID |
| `projectId` | string? | Project ID (auto-detected if omitted) |

---

#### `scene-coaching`
Status-adaptive coaching for a scene. Adapts review approach based on scene status.

| Param | Type | Description |
|-------|------|-------------|
| `sceneId` | string | The scene node ID |
| `projectId` | string? | Project ID for broader context |

---

#### `inline-edit`
Inline text editing operations on selected text.

| Param | Type | Description |
|-------|------|-------------|
| `action` | enum | `rewrite-tighter`, `rewrite-vivid`, `rewrite-simpler`, `continue`, `expand`, `voice-check`, `ask` |
| `selectedText` | string | The text to edit or analyze |
| `sceneContext` | string? | Surrounding text for context |
| `askPrompt` | string? | Custom prompt (required for `ask` action) |

---

#### `manuscript-analysis`
Deep manuscript-level analysis.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID |
| `analysisType` | enum | `plot-threads`, `character-arcs`, `consistency-check` |

---

#### `plan_beats`
Map a scene as structured BEAT blocks — structural waypoints for what happens, what
shifts, and what the reader feels. Annie provides the blueprint; the writer fills in
the prose.

| Param | Type | Description |
|-------|------|-------------|
| `sceneId` | string | The scene node ID to plan beats for |
| `projectId` | string? | Project ID (auto-detected from scene if omitted) |

---

#### `review-editor`
Review manuscript as a seasoned acquisitions editor — commercial viability, hook strength, pacing, character arc payoff.

Uses `export_manuscript` to load the full manuscript, then applies an acquisitions-editor lens: narrative structure, pacing, opening hook, character arc payoff, thematic clarity, and publication readiness.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID to review |

---

#### `review-fan`
Review manuscript as an avid genre reader — visceral reader response, emotional reactions, genre expectations.

Uses `export_manuscript` to load the full manuscript, then reacts as a genre reader: hook, hold, ending satisfaction, genre promise delivery, and specific moment reactions.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID to review |

---

#### `review-author`
Review manuscript as a published peer author — craft-level feedback on prose, POV, dialogue, scene construction.

Uses `export_manuscript` to load the full manuscript, then applies craft-level peer review: prose rhythm, POV discipline, dialogue quality, scene construction, show-don't-tell, inciting incident timing.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project ID to review |

---

### Skill Prompts

All skills from `.skills/` are also registered as MCP Prompts. Each accepts:

| Param | Type | Description |
|-------|------|-------------|
| `nodeId` | string? | Structure node ID to focus on (scene or chapter) |
| `projectId` | string? | Project ID for context |

Available skills:
- `developmental-edit` — Structural and story-level feedback
- `line-edit` — Sentence-level clarity, voice, word choice
- `consistency-check` — Cross-reference world elements for contradictions
- `plot-structure-analysis` — Analyze against narrative frameworks
- `character-arc-review` — Map arcs, identify flat characters
- `scene-drafting-assistant` — Draft scenes from outline context
- `outline-review` — Review scene outlines before drafting
- `story-development-chat` — Open-ended story development conversation
