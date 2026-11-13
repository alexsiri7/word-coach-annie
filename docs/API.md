# API Reference

All endpoints are REST JSON APIs under `/api/`. Requests that modify data require authentication when `API_TOKEN` is set (see [SETUP.md](SETUP.md)).

**Authentication header**: `Authorization: Bearer <API_TOKEN>` or session cookie from `POST /api/auth/login`. Other apps acting as a user send `Authorization: Bearer <personal API token>` (see [Personal API tokens](#personal-api-tokens)); `read`/`write` tokens reach only `/api/nodes/**` and `/api/mcp`; a `snapshots` token reaches only `POST /api/projects/:id/locations/:slug/snapshots`.

**Base URL**: `http://localhost:3000` (dev) or your Cloudflare Tunnel URL (prod)

---

## Observability

### `GET /api/metrics`
Returns Prometheus-format metrics for the Annie service.

**Authentication**: Required when auth is enabled (`AUTH_ENABLED=true`). Only the `Authorization: Bearer <API_TOKEN>` header is accepted; user session cookies and MCP access tokens are rejected.

**Response**:
- `200 text/plain` — Prometheus text format (metrics payload). Metrics include:
  - `annie_http_requests_total{method, path, status}` — request counter covering every HTTP request served, including proxy-generated 401/429 responses
  - `annie_http_request_duration_seconds{method, path}` — latency histogram
  - `path` is the Next.js route template (for example `/api/projects/[id]`), or `other` for unmatched paths and static assets (the templates come from `.next/routes-manifest.json`, which only `next build` writes, so under `next dev` every path is labelled `other`)
  - `annie_projects_total` — gauge: total projects in database
  - `annie_users_total` — gauge: total users in database
- `401 Unauthorized` — auth is enabled and the request does not carry the `API_TOKEN` bearer
- `503 Service Unavailable` — database is unreachable

---

## Authentication

### `POST /api/auth/login`
Authenticate with the API token and receive a session cookie.

**Body**: `{ "token": "<API_TOKEN>" }`

**Response**: Sets an `annie_session` cookie, unique to this login, that the server rejects after one hour (`SESSION_MAX_AGE`) or once `API_TOKEN` is rotated. Returns `{ "ok": true }`.

**Error**: `501` if `API_TOKEN` not configured; `401` if token is wrong, missing, or not a string; `429` after 5 attempts per minute from one IP.

---

### `GET /api/auth/me`
Returns the current authenticated user (Google OAuth only).

**Response**: `{ "id", "email", "name", "picture" }` or `401` if not authenticated. Shares the per-IP limit of 5 requests per minute with login and refresh (`429` beyond it).

---

### `POST /api/auth/logout`
Revokes the session and refresh token JTIs (via blocklist) and clears both `annie_session` and `annie_refresh` cookies.

---

### `POST /api/auth/refresh`
Silently renew the session cookie. Called automatically by the client every 45 minutes.

Both paths re-load the user from the database and mint the new cookies from the current user row; a user whose account was deleted or whose email no longer passes `ALLOWED_EMAILS` gets `401`.

**Path 1** (session still valid): Verifies the `annie_session` cookie and re-issues it with a fresh 1-hour `Max-Age`.

**Path 2** (session expired): Falls back to the `annie_refresh` cookie (30-day lifetime, blocklist-checked). If valid, atomically claims the old refresh token (single use) and issues a new `annie_session` cookie and a rotated `annie_refresh` cookie. Presenting an already-claimed refresh token (e.g. a replayed or concurrently used cookie) returns `401`.

**Response**: `200 { "ok": true }` with updated `Set-Cookie` header; `401 { "error": "Session expired or revoked" }` if the token is missing, expired, revoked, already used, or its user is deleted or no longer allowed (also when the revocation check itself fails — fail closed); `500 { "error": "Internal error" }` if the user lookup or refresh-token claim hits a database error.

---

### `GET /api/auth/google`
Initiates Google OAuth flow. Redirects to Google's consent screen.

---

### `GET /api/auth/google/callback`
OAuth callback. Validates the code, creates/updates `GoogleCredential`, sets session and refresh cookies, and redirects to app.

---

## Privacy & Data (GDPR)

### `GET /api/auth/export-data`
Export all personal data for the authenticated user as a ZIP archive (GDPR Article 20 — data portability).

**Authentication**: Required (session cookie). Returns `401` if not authenticated.

**Response**:
- `200 application/zip` — ZIP archive (`annie-full-export-<date>.zip`) containing:
  - `profile.json` — user profile fields (`id`, `email`, `name`, `picture`, `createdAt`, `updatedAt`)
  - `ai-settings.json` — AI preferences (API key is **omitted** for security)
  - `consents.json` — consent preferences (`feature`, `consentGiven`, `updatedAt` per entry)
  - `providers.json` — contest/publication providers
  - `opportunities.json` — tracked opportunities
  - `writing-tasks.json` — practice tasks not tied to a project
  - `projects/<title>-<id>.json` — full project JSON for each project (the id keeps titles that sanitize alike from colliding), including:
    - structure nodes, story objects, chat messages, annotations, relationships
    - `writingSessions` — word count and duration records per scene
    - `conversations` — AI chat threads (title, type, summary; messages excluded)
    - `googleDocExports` — Google Docs sync records (credential tokens **omitted**)
    - `hashnodeExports` — Hashnode publish records (`credentialId` **omitted** for security)
    - `universeId`, `shares`, `peerReviews`, `writingTasks`, `contestSubmissions`, `publicationSubmissions`, `opportunityCandidates`
  - `universes/<title>-<id>.json` — each universe with its `worldObjects` (and their `timeline`), world-object `relationships` and `googleDocExports` (credential tokens **omitted**)
- `401 Unauthorized` — not authenticated
- `500 Internal Server Error` — export generation failed

---

### `DELETE /api/auth/delete-account`
Permanently delete the authenticated user's account and all associated data (GDPR Article 17 — right to erasure).

**Authentication**: Required (session cookie). Returns `401` if not authenticated.

**CSRF**: Requires `X-CSRF-Protection: 1` header. Returns `403` without it.

**Mode restriction**: Only available in Google Auth mode. Returns `403` in API_TOKEN (single-user) mode — owner-operated instances are not subject to GDPR self-service deletion.

**Request body**:
```json
{ "email": "user@example.com" }
```
The `email` field must exactly match the authenticated user's email as a confirmation step.

**Response**:
- `200 OK` — `{ "ok": true }`. Session and refresh token JTIs are revoked (via blocklist) and both `annie_session` and `annie_refresh` cookies are cleared (`Max-Age=0`).
- `400 Bad Request` — missing/invalid email, or email does not match (`{ "error": "Email does not match" }`)
- `401 Unauthorized` — not authenticated or user not found
- `403 Forbidden` — missing CSRF header, or API_TOKEN mode
- `500 Internal Server Error` — deletion failed

---

### `GET /api/account/consent`
Returns the current user's consent preferences.

**Authentication**: Required (session cookie). Returns `401` if not authenticated.

**Response**: Array of consent rows:
```json
[
  {
    "id": "string",
    "userId": "string",
    "feature": "sentry_replay",
    "consentGiven": true,
    "updatedAt": "ISO timestamp"
  }
]
```

An empty array means the user has no explicit consent records; each feature defaults to opt-out.

**Errors**:
- `401 Unauthorized` — not authenticated
- `500 Internal Server Error` — database error

---

### `PUT /api/account/consent`
Update the authenticated user's consent preference for a specific feature.

**Authentication**: Required. Returns `401` if not authenticated.

**Body**:
```json
{
  "feature": "sentry_replay",
  "consentGiven": true | false
}
```

**Response**: `200` — updated consent row (same shape as GET response item)

**Errors**:
- `400 Bad Request` — missing/invalid `feature` or `consentGiven`, or unrecognised `feature` value
- `401 Unauthorized` — not authenticated
- `500 Internal Server Error` — database error

---

## Personal API Tokens

A personal API token (`annie_pat_…`) lets another app act as the user who created it. Send it as `Authorization: Bearer <token>`.

- A `read` or `write` token reaches only `/api/nodes/**` and `/api/mcp`. Any other path returns `403 { "error": "Personal API tokens can only access scenes" }`, including these token endpoints.
- A `snapshots` token reaches only [`POST /api/projects/:id/locations/:slug/snapshots`](#post-apiprojectsidlocationsslugsnapshots), for a game's build job. Any other path, `/api/mcp` included, returns `403 { "error": "This API token can only post location snapshots" }`.
- A `read` token may only `GET`/`HEAD` the node routes; a write returns `403 { "error": "This API token is read-only" }`. A `write` token may read and write scenes. Over `/api/mcp`, a token sees only its scope's scene tools (see [MCP.md](MCP.md#personal-api-tokens)).
- An unknown or revoked token returns `401`. Each token has its own rate limits (120 reads and 60 writes per minute).

### `GET /api/account/api-tokens`
Lists the current user's tokens, newest first. The token itself is never returned again.

**Response**: `{ "tokens": [{ "id", "name", "scope": "read" | "write" | "snapshots", "hint", "createdAt", "lastUsedAt" }] }` — `hint` is the token's last four characters; `lastUsedAt` is `null` until first use and updates at most once a minute.

**Errors**: `401` if not signed in.

---

### `POST /api/account/api-tokens`
Creates a token. Requires the `X-CSRF-Protection: 1` header.

**Body**: `{ "name": "Punland editor", "scope": "read" | "write" | "snapshots" }` — `name` is 1–100 characters.

**Response**: `201 { "token": "annie_pat_…", "apiToken": { "id", "name", "scope", "hint", "createdAt", "lastUsedAt" } }`. This is the only time the token is shown.

**Errors**: `400` invalid body; `401` not signed in; `403` missing CSRF header.

---

### `DELETE /api/account/api-tokens/:id`
Revokes a token; apps using it get `401` from then on. Requires the `X-CSRF-Protection: 1` header.

**Response**: `{ "ok": true }`

**Errors**: `401` not signed in; `403` missing CSRF header; `404` no such token for this user.

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
      "isSample": false,
      "archivedAt": "ISO8601 | null",
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601",
      "wordCount": 0,
      "nodeCount": 0,
      "sceneCount": 0,
      "characterCount": 0
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

**Errors**:
- `401` unauthenticated (Google OAuth mode only)
- `403` active project limit reached — `{ "error": "You've reached your N active project limit. Archive a project to create a new one." }`. Default limit is **3** (stored as `maxActiveProjects` on `UserAiSettings`; can be raised via direct DB edit). Archived projects do not count.

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

Each project object carries `coverImageId`: the id of its cover location image, or `null`.

---

### `GET /api/projects/:id/relationships`
List all relationships in a project, including edges touching a world object of the project's linked universe.

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

**Auth**: Project owner or shared reader access required. OUTLINE scenes are omitted for READER shares.

**Response**: Binary PDF file (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<title>.pdf"`).

---

### `GET /api/projects/:id/export/epub`
Export the project manuscript as an EPUB file.

**Auth**: Project owner or shared reader access required. OUTLINE scenes are omitted for READER shares.

**Response**: Binary EPUB file (`Content-Type: application/epub+zip`, `Content-Disposition: attachment; filename="<title>.epub"`).

---

### `GET /api/projects/:id/export/docx`
Export the project manuscript as a DOCX file.

**Auth**: Project owner or shared reader access required. OUTLINE scenes are omitted for READER shares.

**Response**: Binary DOCX file (`Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `Content-Disposition: attachment; filename="<title>.docx"`).

---

## Structure Nodes

### `GET /api/nodes/:id`
Get a structure node by ID.

**Errors**: `403` for READER shares on an OUTLINE scene

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

**Body**: `{ type: "PART|CHAPTER|SCENE", title: "string", parentId?: "string", orderIndex?: number, insertAfterIndex?: number }`

`insertAfterIndex` — when provided, inserts the new node immediately after the sibling node with that `orderIndex`, shifting subsequent siblings up. Takes precedence over `orderIndex`.

---

### `GET /api/nodes/:id/content`
Get a scene's content (latest version + version history + annotations).

**Query params**: `versionId` — if provided, returns that specific version only.

**Response**: `{ content, wordCount, versions[], annotations[] }`

**READER shares**: `history` is empty; `versionId` and OUTLINE scenes return `403`.

---

### `POST /api/nodes/:id/content`
Save scene content (creates a new version).

**Body**: `{ content: "string" }`

**Response**: `{ version: ContentVersion, wordCount: number }`

**Errors**: `400` if `content` is missing or not a string; `413` if it exceeds 2 MiB (2,097,152 characters)

---

### `PATCH /api/nodes/:id/content`
Restore a previous content version.

**Body**: `{ versionId: "string" }`

---

### `GET /api/nodes/:id/annotations`
List annotations for a node.

### `POST /api/nodes/:id/annotations`
Add an annotation to a node.

**Body**: `{ content: string, range?: string, selectedText?: string }`

**Errors**: `400` if `content` is empty, a field is not a string, `content` exceeds 10,000 characters, or `selectedText` exceeds 2 MiB (2,097,152) or `range` 4 MiB (4,194,304) characters. Limits apply before sanitization

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
Delete a story object. Its location images, map and snapshots, and their stored files, are deleted too.

---

### `GET /api/story-objects/:id/images`
List a location's images in display order. Owner only.

**Response**: `{ data: [{ id, storyObjectId, kind, caption, orderIndex, isCover, width, height, bytes, sha256, createdAt, updatedAt, thumbUrl, fullUrl }] }`. `thumbUrl`/`fullUrl` are the `/api/location-images/:id/file` URLs below.

---

### `POST /api/story-objects/:id/images`
Upload an image to a LOCATION story object. Owner only; requires the `x-csrf-protection: 1` header.

**Body** (`multipart/form-data`): `file` (JPEG, PNG, WebP or GIF; at most 20 MB and 25 megapixels), optional `kind` (`reference` | `mood` | `sketch`, default `reference`) and `caption` (max 500 characters).

The image is re-encoded to WebP (longest side 2048 px, plus a 400 px thumbnail) with metadata stripped. The first image becomes the cover.

**Response**: `201` with the image. `400` for a non-image or a non-location, or when another edit to the same location's images was in progress (retry); `413` over 20 MB, `503` when storage is not configured.

---

### `PATCH /api/location-images/:id`
Update an image. Owner only.

**Body**: `{ caption?, kind?, orderIndex?, isCover? }` — `orderIndex` moves the image (0 = first); `isCover: true` replaces the previous cover.

**Errors**: `400` invalid body, or another edit to the same location's images was in progress (retry); `404` image not found

---

### `DELETE /api/location-images/:id`
Delete an image and its stored files. Owner only. Deleting the cover makes the new first image the cover.

**Errors**: `400` if another edit to the same location's images was in progress (retry); `404` image not found

---

### `GET /api/story-objects/:id/map`
Read a location's top-down map. Owner only.

**Response**: `{ data: { id, storyObjectId, widthM, heightM, backgroundImageId, items, updatedAt, contentHash } }`, or `{ data: null }` when the location has no map. Each item also carries read-only `linkName` (the linked story object's current name, or `null`) and `unlinked` (`true` when its link target no longer exists).

Coordinates are metres from the map's top-left corner, y down. An item is `{ id, kind, label, description, x, y, w, h, rotation, points?, storyObjectId?, targetLocationId? }`: `kind` is `object` | `character` | `exit` | `area` | `note`; `x, y` is its centre, `w, h` its size and `rotation` degrees clockwise about the centre. An `area` has `points`, at least three `[x, y]` pairs relative to its centre and within `±w/2, ±h/2`. `storyObjectId` links an `object` to a WORLD_ELEMENT or a `character` to a CHARACTER; `targetLocationId` links an `exit` to a LOCATION.

**Errors**: `400` not a location; `404` story object not found

---

### `PUT /api/story-objects/:id/map`
Create or replace a location's map. Owner only; the last write wins.

**Body**: `{ widthM, heightM, backgroundImageId?, items }` — `widthM` and `heightM` 1–200, at most 500 items with unique ids, `backgroundImageId` one of this location's images or `null`. `linkName` and `unlinked` are ignored, so a map read from `GET` can be sent back. A link must point to a story object of the right type in this project, unless the same item, as the same kind, already held it (so an unlinked item can be saved again).

**Response**: `{ data: <map> }` as for `GET`.

**Errors**: `400` with the first problem and where it is (e.g. `items.0.kind: …`), a link of the wrong type, a background from elsewhere, a non-location, or another edit to the same map in progress (retry); `404` story object not found

---

### `DELETE /api/story-objects/:id/map`
Delete a location's map. Owner only.

**Response**: `{ deleted: true }`. **Errors**: `400` not a location; `404` story object not found, or it has no map

---

### `GET /api/location-images/:id/file`
Redirect (`302`) to a signed storage URL valid for an hour. Owner only.

**Query params**: `variant`: `thumb` (default, 400 px) | `full`

---

### Location snapshots

A game's screenshots of a location, with the clickable "things" on them, and the author's annotations. Owner only, like location images. Coordinates (thing boxes, annotation regions) are pixels of the uploaded screenshot, whose size is the snapshot's `width` × `height`. The ten most recently received snapshots of a location are kept; older ones and their files are deleted, while their annotations stay with `snapshotId: null`.

### `POST /api/projects/:id/locations/:slug/snapshots`
Post a game's screenshot of a location. Authenticate with a `snapshots` personal API token (no CSRF header needed); a signed-in owner may also post with the `X-CSRF-Protection: 1` header.

`:slug` names the project's LOCATION as the story-sync export does: the name lowercased, every run of characters other than `a-z0-9` replaced by `-`, trimmed of `-` (`untitled` if empty); locations sharing a slug get `-2`, `-3`, … in name-then-id order.

**Body** (`multipart/form-data`):
- `file`: the screenshot (JPEG, PNG, WebP or GIF; at most 20 MB and 25 megapixels), stored re-encoded to WebP (longest side 2048 px).
- `build`: version string or commit, 1–200 characters.
- `takenAt`: ISO date-time.
- `things`: JSON array (at most 500, 1 MB) of `{ key, name, description?, kind?, box: { x, y, w, h } }`. `key` (1–200 characters) is the game's stable id for the thing and must be unique; `name` ≤ 200, `description` ≤ 5000, `kind` ≤ 50 characters.

**Response**: `201 { created: true, snapshot }`, or `200 { created: false, snapshot }` when the file bytes and things equal the latest snapshot's (nothing is stored). `snapshot` is `{ id, storyObjectId, build, takenAt, sha256, width, height, things, createdAt, imageUrl }`, things sorted by `key`. Storing a snapshot marks done every open or sent name/description request whose text the snapshot's thing now carries (ignoring whitespace differences).

**Errors**: `400` invalid field or not an image; `403` another user's project or missing CSRF header; `404` `{ error: "Project not found" }`, or `{ error: "Unknown location", knownSlugs: [...] }` for an unknown slug (nothing is stored); `413` over 20 MB; `503` storage not configured.

---

### `GET /api/story-objects/:id/snapshots`
A location's snapshots, newest first, and all of its annotations.

**Response**: `{ data: [{ id, build, takenAt, createdAt, width, height, thingCount }], annotations: [{ id, locationId, snapshotId, kind, thingKey, region, text, storyObjectId, status, createdAt, updatedAt }] }`

---

### `GET /api/location-snapshots/:id`
One snapshot with its `things` and `imageUrl` (`/api/location-snapshots/:id/file`).

---

### `GET /api/location-snapshots/:id/file`
Redirect (`302`) to a signed storage URL valid for an hour.

---

### `POST /api/location-snapshots/:id/annotations`
Annotate a snapshot. Requires the `X-CSRF-Protection: 1` header.

**Body**:
- A note: `{ kind: "note", text, region?, thingKey?, storyObjectId? }`. `text` is 1–5000 characters. `region` is `{ type: "point", x, y }`, `{ type: "rect", x, y, w, h }` or `{ type: "path", points: [[x, y], …] }` (2–1000 points). `storyObjectId` must be in the same project.
- A requested change: `{ kind: "description" | "name", thingKey, text }`. `thingKey` must be one of the snapshot's things; a name is 1–200 characters, a description up to 5000. It replaces the thing's open request for that field, if any.

**Response**: `201` with the annotation (`status: "open"`).

**Errors**: `400` invalid body, unknown thing, or a story object from another project; `404` snapshot not found.

---

### `PATCH /api/snapshot-annotations/:id`
**Body**: `{ text?, status?: "open" | "sent" | "done", region?, storyObjectId?: string | null }` — `region` and `storyObjectId` only for notes; `null` unlinks. `sent` means exported by the story sync; `done` resolves it.

**Errors**: `400` invalid or empty body; `404` annotation not found.

---

### `DELETE /api/snapshot-annotations/:id`
Delete an annotation.

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

`fromObjectId`/`toObjectId` resolve to a story object in this project first, then to a world object in the project's linked universe; the created edge is stored on `fromObjectId`/`fromWorldObjectId` (or the `to*` pair) accordingly. Responses include `fromNode`, `fromObject`, `fromWorldObject`, `toNode`, `toObject` and `toWorldObject`.

**Errors**: `400` invalid body or not exactly one `from*`/`to*` field; `404` project, node or object not found in this project or its linked universe

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

**Errors**: `400` if the location has images or a map — remove them before transferring; `400` if the location has game snapshots, which can't be moved to a universe

---

### `POST /api/universes/:id/projects`
Link a project to a universe (moves it if it is linked elsewhere).

**Body**: `{ projectId: string }`

**Errors**: `400` missing projectId, `403`/`404` for the universe or the project

---

### `DELETE /api/universes/:id/projects/:projectId`
Unlink a project from this universe.

**Errors**: `403`/`404` for the universe or the project, `404` if the project is not linked to this universe

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

**Body**: `{ label: string, description?: string, attributes?: string, orderIndex?: number, projectId?: string }`

**Errors**: `400` validation failure (missing or empty `label`); `401` unauthenticated

---

### `PATCH /api/world-objects/:id/timeline/:entryId`
Update a timeline entry. At least one field must be provided.

**Body**: `{ label?: string, description?: string, attributes?: string, orderIndex?: number }`

**Errors**: `400` validation failure (no fields provided or empty `label`); `401` unauthenticated

---

## Timeline

### `GET /api/timeline/:projectId`
Get the data behind a project's timeline matrix. Read-only.

**Response**: `{ scenes: StructureNode[], objects: StoryObject[], events: Relationship[] }` — scenes in manuscript order, the project's story objects, and every relationship linking an object to a scene (with `fromObject`, `toNode`, `fromNode`, `toObject` included). The timeline view builds the object×scene presence matrix from these client-side.

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

**Errors**: `413` if the gathered manuscript context exceeds 200,000 characters

---

## Peer Review

### `POST /api/projects/:id/peer-review`
Run **four** parallel AI reviewer personas (Publisher, Avid Reader, Experienced Writer, Comedy Writer) against
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
  "comedy": { "...same shape as publisher, nullable — absent on pre-comedy reviews..." },
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

Past reviews are read with `GET /api/projects/:id/peer-review` (list) and
`GET /api/projects/:id/peer-review/:reviewId` (full row); both return `403` for READER shares.

---

## Integrations

### `GET /api/integrations/google-docs`
Get Google Docs export status and records for a project.

**Query params**: `projectId` (optional — if omitted, returns connection status only)

**Response**: `{ exports: GoogleDocExport[], connected: boolean }`

---

### `POST /api/integrations/google-docs/export`
Export or sync a project to Google Docs.

**Auth**: Project owner only.

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

**Body**: JSON export data (project object). A story object with a missing or blank `type` is imported as `NOTE`; any other `type` is kept as-is.

**Errors**: `400` invalid JSON, an unknown node `type`/`status` or `projectType`, a non-integer `orderIndex` or one outside the 32-bit integer range, a non-object entry in any collection, or more than 5,000 structure nodes or story objects / 20,000 content versions, annotations or relationships; `401` unauthenticated (Google OAuth mode only); `413` body over 5 MB

---

## Writing Tasks

### `GET /api/writing-tasks`
List writing tasks for a project.

**Query params**: `projectId` (required), `completed` (boolean), `energy`, `importance`, `size`, `kind`, `capacity`

**Response**: `{ tasks: WritingTask[], total: number }`

**Errors**: `400` if `projectId` missing; `401` unauthenticated; `403` for READER shares

---

### `POST /api/writing-tasks`
Create a new writing task.

**Body**: `{ projectId: string, name: string, whatIsNeeded?: string, importance?: string, size?: string, energy?: string, sceneId?: string, kind?: string, capacity?: string, dueDate?: string }`

**Response**: Created `WritingTask` object (status 201).

**Errors**: `400` validation failure (missing `projectId` or empty `name`); `401` unauthenticated

---

### `PATCH /api/writing-tasks/:id`
Update a writing task's fields.

**Body**: Any subset of `{ name, whatIsNeeded, importance, size, energy, kind, capacity, dueDate, completed }` (`dueDate: null` clears it)

**Response**: Updated `WritingTask` object.

**Errors**: `400` empty body (no fields to update); `404` task not found; `401`/`403` unauthorized

---

### `DELETE /api/writing-tasks/:id`
Delete a writing task.

**Response**: `{ success: true }`

**Errors**: `404` task not found; `401`/`403` unauthorized

---

### `POST /api/writing-tasks/:id/complete`
Mark a writing task as complete.

**Response**: Updated `WritingTask` with `completed: true`.

**Errors**: `404` task not found; `401`/`403` unauthorized
