# API Reference

All endpoints are REST JSON APIs under `/api/`. Requests that modify data require authentication when `API_TOKEN` is set (see [SETUP.md](SETUP.md)).

**Authentication header**: `Authorization: Bearer <API_TOKEN>` or session cookie from `POST /api/auth/login`.

**Base URL**: `http://localhost:3000` (dev) or your Cloudflare Tunnel URL (prod)

---

## Observability

### `GET /api/metrics`
Returns Prometheus-format metrics for the Annie service.

**Authentication**: None required (public endpoint).

**Response**: `200 text/plain` with Prometheus text format. Metrics include:
- `annie_http_requests_total{method, path, status}` — request counter
- `annie_http_request_duration_seconds{method, path}` — latency histogram
- `annie_projects_total` — gauge: total projects in database
- `annie_users_total` — gauge: total users in database

**Error**: `503 Service Unavailable` if the database is unreachable.

---

## Authentication

### `POST /api/auth/login`
Authenticate with the API token and receive a session cookie.

**Body**: `{ "token": "<API_TOKEN>" }`

**Response**: Sets `annie-session` cookie. Returns `{ "ok": true }`.

**Error**: `501` if `API_TOKEN` not configured; `401` if token wrong.

---

### `GET /api/auth/me`
Returns the current authenticated user (Google OAuth only).

**Response**: `{ "id", "email", "name", "picture" }` or `401` if not authenticated.

---

### `POST /api/auth/logout`
Clears the session cookie.

---

### `GET /api/auth/google`
Initiates Google OAuth flow. Redirects to Google's consent screen.

---

### `GET /api/auth/google/callback`
OAuth callback. Validates the code, creates/updates `GoogleCredential`, sets session cookie, and redirects to app.

---

## Projects

### `GET /api/projects`
List all projects (scoped to current user when authenticated via Google).

**Query params**: `limit` (default: 20), `offset` (default: 0)

**Response**:
```json
{
  "projects": [
    {
      "id": "string",
      "title": "string",
      "author": "string",
      "synopsis": "string",
      "genre": "string",
      "projectType": "FICTION | ARTICLE_COLLECTION | GENERAL",
      "wordCount": 0,
      "nodeCount": 0,
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601"
    }
  ],
  "total": 0
}
```

---

### `POST /api/projects`
Create a new project.

**Body**: `{ "title": "string", "author"?: "string", "synopsis"?: "string", "genre"?: "string", "projectType"?: "FICTION|ARTICLE_COLLECTION|GENERAL" }`

**Response**: Project object (201)

**Errors**: `401` unauthenticated (Google OAuth mode only)

---

### `GET /api/projects/:id`
Get a project by ID.

**Response**: Full project object including structure counts.

**Errors**: `404` not found, `403` unauthorized

---

### `PATCH /api/projects/:id`
Update project metadata.

**Body**: Any subset of `{ title, author, synopsis, genre, projectType }`

---

### `DELETE /api/projects/:id`
Delete a project and all its data.

---

### `GET /api/projects/:id/outline`
Get the full hierarchical outline tree for a project.

**Response**: Nested `OutlineNode[]` — `{ id, type, title, synopsis, status, orderIndex, parentId, wordCount, children[] }`

---

### `GET /api/projects/:id/search`
Full-text search across scenes and story objects.

**Query params**: `q` (required) — search query string

**Response**: `{ scenes: SearchResult[], storyObjects: SearchResult[] }` where each result includes a highlighted `snippet`.

---

### `GET /api/projects/:id/story-objects`
List all story objects in a project.

**Query params**: `type` (optional filter: CHARACTER, LOCATION, PLOTLINE, WORLD_ELEMENT, NOTE)

---

### `GET /api/projects/:id/relationships`
List all relationships in a project.

---

### `GET /api/projects/:id/nodes`
List all structure nodes (non-nested) for a project.

---

### `GET /api/projects/:id/graph`
Get the relationship graph for a project (nodes + edges for visualization).

---

### `GET /api/projects/:id/export`
Export the project manuscript.

**Query params**:
- `format`: `manuscript` | `chapters` | `story-bible` | `medium` | `json`
- `includeSynopsis`: `true|false`
- `includeSceneBreaks`: `true|false`
- `chapterNumbering`: `true|false`

**Response**: Markdown string (Content-Type: text/markdown), JSON array for `format=chapters`, or full project JSON export for `format=json`.

---

### `GET /api/projects/export-all`
Export all projects as a ZIP archive.

---

### `GET /api/projects/:id/export/pdf`
Export the project manuscript as a PDF file.

**Auth**: Project owner or shared reader access required.

**Response**: Binary PDF file (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<title>.pdf"`).

---

### `GET /api/projects/:id/export/epub`
Export the project manuscript as an EPUB file.

**Auth**: Project owner or shared reader access required.

**Response**: Binary EPUB file (`Content-Type: application/epub+zip`, `Content-Disposition: attachment; filename="<title>.epub"`).

---

## Structure Nodes

### `GET /api/nodes/:id`
Get a structure node by ID.

---

### `PATCH /api/nodes/:id`
Update a node's metadata (title, synopsis, status, orderIndex).

**Body**: `{ title?, synopsis?, status?: "OUTLINE|DRAFT|REVISED|FINAL", orderIndex? }`

---

### `DELETE /api/nodes/:id`
Delete a node and all its children recursively.

---

### `POST /api/projects/:id/nodes`
Create a new structure node under a project.

**Body**: `{ type: "PART|CHAPTER|SCENE", title: "string", parentId?: "string", orderIndex?: number }`

---

### `GET /api/nodes/:id/content`
Get a scene's content (latest version + version history + annotations).

**Query params**: `versionId` — if provided, returns that specific version only.

**Response**: `{ content, wordCount, versions[], annotations[] }`

---

### `PUT /api/nodes/:id/content`
Save scene content (creates a new version).

**Body**: `{ content: "string" }`

**Response**: `{ version: ContentVersion, wordCount: number }`

---

### `PATCH /api/nodes/:id/content`
Restore a previous content version.

**Body**: `{ versionId: "string" }`

---

### `GET /api/nodes/:id/annotations`
List annotations for a node.

---

### `POST /api/nodes/move`
Move a node to a new parent position (reindexes siblings).

**Body**: `{ nodeId: string, newParentId: string | null, newIndex: number }`

---

## Story Objects

### `GET /api/story-objects/:id`
Get a story object by ID (includes relationships).

---

### `PATCH /api/story-objects/:id`
Update a story object.

**Body**: `{ name?, description?, notes?, role?, tags? }`

---

### `DELETE /api/story-objects/:id`
Delete a story object.

---

### `POST /api/projects/:id/story-objects`
Create a story object.

**Body**: `{ type: "CHARACTER|LOCATION|PLOTLINE|WORLD_ELEMENT|NOTE", name: string, description?: string, notes?: string, role?: string }`

---

## Relationships

### `GET /api/relationships/:id`
Get a relationship by ID.

---

### `DELETE /api/relationships/:id`
Delete a relationship.

---

### `POST /api/projects/:id/relationships`
Create a relationship between two entities.

**Body**:
```json
{
  "type": "APPEARS_IN|LOCATED_AT|PART_OF_PLOTLINE|RELATED_TO|INTERACTS_WITH|CONTAINS|PRECEDES|FOLLOWS",
  "label": "string (optional)",
  "fromNodeId": "string (one of from* required)",
  "fromObjectId": "string",
  "toNodeId": "string (one of to* required)",
  "toObjectId": "string"
}
```

---

## Annotations

### `GET /api/annotations`
List open (unresolved) annotations.

**Query params**: `projectId` (optional filter)

**Response**: Array of annotation objects:
```json
[
  {
    "id": "string",
    "content": "string",
    "nodeId": "string",
    "nodeTitle": "string",
    "projectTitle": "string",
    "selectedText": "string | null",
    "createdAt": "ISO 8601 timestamp"
  }
]
```

---

### `POST /api/annotations`
Create an annotation on a node.

**Body**: `{ nodeId: string, content: string, startOffset?: number, endOffset?: number }`

---

### `PATCH /api/annotations/:id`
Update an annotation (e.g., resolve it).

**Body**: `{ content?, resolved?: boolean }`

---

### `DELETE /api/annotations/:id`
Delete an annotation.

---

## Universes

### `GET /api/universes`
List all universes.

---

### `POST /api/universes`
Create a universe.

**Body**: `{ name: string, description?: string }`

**Errors**: `401` unauthenticated (Google OAuth mode only)

---

### `GET /api/universes/:id`
Get a universe with its world objects.

---

### `PATCH /api/universes/:id`
Update universe metadata.

---

### `DELETE /api/universes/:id`
Delete a universe.

---

### `GET /api/universes/:id/world-objects`
List world objects in a universe.

**Query params**: `type` (CHARACTER, LOCATION, WORLD_ELEMENT)

---

### `POST /api/universes/:id/world-objects`
Create a world object.

**Body**: `{ type: "CHARACTER|LOCATION|WORLD_ELEMENT", name: string, description?: string }`

---

### `POST /api/universes/transfer-object`
Transfer a story object from a project to a universe.

**Body**: `{ storyObjectId: string, universeId: string }`

---

## World Objects

### `GET /api/world-objects/:id`
Get a world object by ID (includes timeline entries).

---

### `PATCH /api/world-objects/:id`
Update a world object.

---

### `DELETE /api/world-objects/:id`
Delete a world object.

---

### `GET /api/world-objects/:id/timeline`
List timeline entries for a world object.

---

### `POST /api/world-objects/:id/timeline`
Add a timeline entry.

**Body**: `{ title: string, description?: string, orderIndex?: number }`

---

## Timeline

### `GET /api/timeline/:projectId`
Get the timeline matrix for a project.

**Response**: `{ scenes: Scene[], objects: StoryObject[], matrix: { sceneId, objectId }[] }` — cross-reference of where story objects appear across scenes.

---

## Focus Mode

### `GET /api/focus/:sceneId`
Get all context needed for focus mode.

**Response**: `{ context: SceneContext, related: RelatedElement[], annotations: Annotation[], timelineScenes: { id: string; title: string; status: string; orderIndex: number; chapterTitle?: string }[] }`

---

## Chat Threads

Conversations are named thread containers scoped to a project. Each project has one or more threads; `POST /api/chat` messages are always sent to a specific thread via `conversationId`.

### `GET /api/conversations`
List all conversation threads for a project, ordered by most recently updated.

**Query params**: `projectId=<id>` (required)

**Response**: `{ conversations: [{ id, title, updatedAt, createdAt, messageCount }] }`

**Errors**: `400` if `projectId` missing; `403` if not authorized.

---

### `POST /api/conversations`
Create a new conversation thread.

**Body**:
```json
{
  "projectId": "string",
  "title": "string (optional — defaults to \"New chat\")"
}
```

**Response** (`201`): `{ id, title, projectId, createdAt, updatedAt }`

**Errors**: `400` if `projectId` missing; `403` if not authorized.

---

### `PATCH /api/conversations/[id]`
Rename a conversation thread.

**Body**: `{ "title": "string" }`

**Response**: `{ id, title, updatedAt }`

**Errors**: `400` if title missing; `404` if conversation not found; `403` if not authorized.

---

### `DELETE /api/conversations/[id]`
Delete a conversation thread and cascade-delete all its messages.

**Response**: `{ success: true }`

**Errors**: `404` if conversation not found; `403` if not authorized.

---

## AI Chat

### `GET /api/chat`
Load conversation metadata and message history.

**Query params**: `conversationId=<id>` — OR — `projectId=<id>` (returns or creates the default conversation for the project)

**Response**: `{ conversation: { id, title, projectId, ... }, messages: [...] }`

---

### `POST /api/chat`
Stream an AI chat response within a conversation thread.

**Body**:
```json
{
  "conversationId": "string",
  "message": "string",
  "sceneContext": "string (optional — injects scene content into context)"
}
```

**Response**: Server-Sent Events stream (`text/event-stream`). Each event is `data: <JSON>\n\n`.

Event shapes:
- `{ type: "text", content: "string" }` — streamed text chunk
- `{ type: "tool_call", name: "string", result: any }` — tool execution result
- `{ type: "done" }` — stream complete
- `{ type: "error", message: "string" }` — error

---

## AI Settings

### `GET /api/ai-settings`
Get current AI provider settings. Returns masked API key.

**Response**: `{ baseUrl, apiKey (masked), model, hasApiKey, scope: "user|global" }`

---

### `PUT /api/ai-settings`
Update AI provider settings.

**Body**: `{ baseUrl?: string, apiKey?: string, model?: string }`

AI settings are per-user when authenticated via Google, otherwise global.

---

## MCP Proxy

### `POST /api/mcp`
HTTP transport proxy for MCP protocol. Used by web-based MCP clients.

**Body**: MCP JSON-RPC request

**Response**: MCP JSON-RPC response

---

## System

### `GET /api/health`
Health check.

**Response**: `{ ok: true }`

---

### `GET /api/setup-status`
Check if the app has been configured (AI settings, auth).

**Response**: `{ hasApiToken: boolean, hasAiSettings: boolean, hasGoogleAuth: boolean }`

---

### `POST /api/feedback`
Submit feedback (creates a GitHub issue if `GITHUB_FEEDBACK_TOKEN` is configured).

**Body**: `{ type: "bug|feature|other", message: string, email?: string, context?: { url?, userAgent?, screenSize? } }`

> **Privacy**: `email` is accepted for interface compatibility but is never embedded in the public GitHub issue body. The `url` is reduced to pathname-only (query params and hash are stripped) before embedding.

---

## AI Inline

### `POST /api/ai-inline`
Run an inline AI editing action on a selected text passage.

**Body**:
```json
{
  "action": "rewrite-tighter | rewrite-vivid | rewrite-simpler | continue | expand | voice-check | ask",
  "text": "string",
  "context": "string (surrounding text for context)",
  "ask": "string (custom prompt, required when action is 'ask')"
}
```

**Response**: `{ result: "string" }` — the AI output for the action.

---

## AI Manuscript

### `POST /api/ai-manuscript`
Run a manuscript-level AI analysis across the full project.

**Body**:
```json
{
  "projectId": "string",
  "analysisType": "plot-threads | character-arcs | consistency-check"
}
```

**Response**: `{ result: "string" }` — the analysis report as Markdown text.

---

## Peer Review

### `POST /api/projects/:id/peer-review`
Run three parallel AI reviewer personas (Publisher, Avid Reader, Experienced Writer) against
the full manuscript and synthesize a consensus.

No request body required.

**Response**:
```json
{
  "publisher": {
    "overallImpression": "string",
    "strengths": ["string"],
    "weaknesses": ["string"],
    "detailedFeedback": "string",
    "recommendation": "publish | revise | pass"
  },
  "reader": { "...same shape as publisher..." },
  "writer": { "...same shape as publisher..." },
  "consensus": {
    "pointsOfAgreement": ["string"],
    "pointsOfDisagreement": ["string"],
    "topPriorities": ["string"],
    "synthesizedRecommendation": "string"
  }
}
```

Returns `{ warning: "AI not configured" }` or `{ warning: "Manuscript is empty" }` if
preconditions are not met. Manuscript is truncated to 50,000 characters before analysis.

**Errors**: `401` unauthorized, `403` forbidden, `500` internal server error

---

## Integrations

### `GET /api/integrations/google-docs`
Get Google Docs export status and records for a project.

**Query params**: `projectId` (optional — if omitted, returns connection status only)

**Response**: `{ exports: GoogleDocExport[], connected: boolean }`

---

### `POST /api/integrations/google-docs/export`
Export or sync a project to Google Docs.

**Body**: `{ projectId: string, exportMode: "STORY_READER" | "STORY_INTERNAL" }`

**Response**: `{ googleDocUrl: string, docId: string }`

---

### `GET /api/integrations/hashnode`
Get Hashnode connection status for the current user.

**Response**: `{ connected: boolean, publication?: { id, title } }`

---

### `POST /api/integrations/hashnode`
Connect a Hashnode account with an API access token.

**Body**: `{ accessToken: string }`

**Response**: `{ connected: true, publication?: { id, title } }`

---

### `DELETE /api/integrations/hashnode`
Disconnect the Hashnode account (removes stored credential).

**Response**: `{ ok: true }`

---

## Writing Sessions

### `GET /api/sessions/heatmap`
Get a 28-day activity heatmap (word counts per day).

**Response**: `{ dates: string[], counts: number[] }` — parallel arrays of dates and word counts.

---

## Structure Nodes (Additional)

### `POST /api/nodes/move`
Move a structure node to a new parent at a specific position, reindexing siblings.

**Body**: `{ nodeId: string, newParentId: string | null, newIndex: number }`

**Response**: Updated node object.

---

## Onboarding

### `POST /api/onboarding/sample`
Create the sample project (Sherlock Holmes) for new users. No-op if the user already has projects.

**Response**: `{ ok: true, projectId: string }` or `{ ok: false, reason: "already_has_projects" }`

**Errors**: `401` unauthenticated (Google OAuth mode only)

---

### `POST /api/projects/import`
Import a project from a JSON export file.

**Body**: JSON export data (project object)

**Errors**: `401` unauthenticated (Google OAuth mode only)
