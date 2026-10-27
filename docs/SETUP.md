# Setup & Deployment

This document covers running Word Coach Annie in production and development, configuring environment variables, and maintaining the database.

## Prerequisites

- Docker and Docker Compose
- Git

That's it — everything runs inside the container. Do not run `npm` or `node` commands on the host.

---

## Production Deployment

### Quick Start (recommended)

```bash
# 1. Clone the repo
git clone https://github.com/alexsiri7/word-coach-annie.git
cd word-coach-annie

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local — at minimum set API_TOKEN and AI_API_KEY
# Phoenix tracing secrets, read by Docker Compose from .env (see "Tracing (Phoenix)")
printf 'PHOENIX_SECRET=%s\nPHOENIX_ADMIN_SECRET=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" >> .env

# 3. Start
docker compose up -d

# 4. Verify
curl http://localhost:3000/api/health   # → {"ok":true}
```

The app runs on `http://localhost:3000`. The database is at `./data/word-coach-annie.db` (persisted via volume mount).

### Image Source

Production uses a pre-built image from GitHub Container Registry:
```
ghcr.io/alexsiri7/word-coach-annie:latest
```

CI builds and pushes this image on every commit to `main` that passes quality gates.

### Updating to Latest

```bash
docker compose pull && docker compose up -d
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

### Required

| Variable | Description |
|----------|-------------|
| `API_TOKEN` | Strong random token for API authentication. **Required if the app is exposed to the internet.** Production refuses to start unless `API_TOKEN` or `GOOGLE_CLIENT_ID` is set. Generate: `openssl rand -hex 32` |

### AI Chat (required for AI features)

| Variable | Description | Default |
|----------|-------------|---------|
| `AI_API_KEY` | API key for your AI provider | — |
| `AI_API_BASE_URL` | Base URL for OpenAI-compatible provider | `https://api.openai.com/v1` |
| `AI_MODEL` | Model name | `gpt-4o` |

The app works with any OpenAI-compatible provider (OpenAI, Anthropic via proxy, Requesty, Ollama, etc.). You can also configure these in the app UI after setup.

### Google Integration (optional)

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (from Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL (e.g., `https://yourdomain.com/api/auth/google/callback`) |

Required for: Google sign-in and Google Docs export.

`APP_BASE_URL` (e.g., `https://yourdomain.com`) sets the public origin used in absolute URLs — the MCP OAuth discovery metadata and calendar feed links. When unset, the origin of `GOOGLE_REDIRECT_URI` is used; without either, those endpoints return an error.

#### OAuth Consent Screen Setup

To allow any Google account to sign in (not just test users), the OAuth consent screen must be published:

1. Go to [Google Cloud Console → APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Fill in the required fields:
   - **App name**: Word Coach Annie
   - **User support email**: your email
   - **App homepage**: your deployed URL (e.g., `https://yourdomain.com`)
   - **Privacy policy link**: `https://yourdomain.com/privacy`
   - **Authorized domains**: your domain
3. Under **Scopes**, add: `openid`, `email`, `profile`
4. **Publish the app**: Click "PUBLISH APP" to move from Testing to In Production
   - In Testing mode, only manually added test users (max 100) can sign in
   - In Production mode, any Google account can sign in
   - An "unverified app" warning appears until Google verifies the app — users can still proceed by clicking "Advanced" → "Go to app"
   - Full verification (removes the warning) requires Google review — submit via the consent screen page if needed

> **Note:** The privacy policy page at `/privacy` must be accessible at your public URL before Google will accept the verification request.

### Security

| Variable | Description |
|----------|-------------|
| `ENCRYPTION_KEY` | Key for encrypting AI API keys at rest. Generate: `openssl rand -hex 32`. **Required** when storing AI API keys; set `ALLOW_PLAINTEXT_STORAGE=true` in local dev to opt out. |
| `ENCRYPTION_KEY_PREVIOUS` | Optional. Comma-separated older encryption keys, used only to decrypt values written before a rotation. See [Rotating ENCRYPTION_KEY](#rotating-encryption_key). |
| `JWT_SECRET` | JWT signing key for Google OAuth sessions. Generate: `openssl rand -hex 32`. **Required** when auth is enabled and must be at least 32 characters; there is no fallback. Production refuses to start if `JWT_SECRET`, `API_TOKEN` or `ENCRYPTION_KEY` is set but shorter than 32 characters. |
| `ALLOWED_EMAILS` | Comma-separated list of Google emails allowed to sign in. When unset, any Google account can sign in. |
| `OAUTH_ALLOWED_REDIRECT_HOSTS` | Comma-separated exact hostnames that MCP clients may register as HTTPS `redirect_uris` via `/oauth/register`. Loopback (`localhost`, `127.0.0.1`, `[::1]`) over `http`/`https` is always allowed. When unset or empty: `claude.ai`. Add a host here to support another web MCP connector. |

> **Migration note:** Prior to this release, `ENCRYPTION_KEY` fell back to `API_TOKEN`. This fallback has been removed for security. If you relied on it, set `ENCRYPTION_KEY` explicitly before upgrading. Generate one with: `openssl rand -hex 32`

#### Rotating ENCRYPTION_KEY

`ENCRYPTION_KEY` protects stored Google OAuth tokens, Hashnode tokens and AI API keys. To change it without unlinking those accounts:

1. Generate a new key: `openssl rand -hex 32`.
2. Set the new key as `ENCRYPTION_KEY` and move the old one into `ENCRYPTION_KEY_PREVIOUS` (comma-separate several old keys if needed).
3. Deploy. On startup the container runs `scripts/reencrypt.mjs`, which rewrites every stored value from a previous key to the new one. You can also run `node scripts/reencrypt.mjs` by hand. Values are also rewritten whenever the app reads them.
4. Check the `reencrypt:` summary in the logs. After a successful run every value that could be decrypted is under the new key. `undecryptable` counts values no configured key can decrypt.
5. Remove `ENCRYPTION_KEY_PREVIOUS` and redeploy.

A stored value that no configured key can decrypt is treated as disconnected: the user is asked to re-link that account or re-enter that API key. The value is never deleted, so restoring the missing key in `ENCRYPTION_KEY_PREVIOUS` recovers it. Do not switch `ENCRYPTION_KEY` back to the old key after values have been rewritten; roll forward instead.

### Optional

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis connection URL for distributed rate limiting (e.g. `redis://localhost:6379`). When unset, rate limiting uses a per-process in-memory store. Production requires `rediss://` (startup refuses `redis://`). The server must speak RESP3 (Redis 6+ / `HELLO 3`): ioredis 6 negotiates RESP3 by default and does not fall back, and because the limiter fails open a RESP2-only server would silently disable rate limiting. |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Tunnel token for public access |
| `PHOENIX_SECRET` | Signs Phoenix auth tokens. Required when running `docker-compose.yml`; generate with `openssl rand -hex 32` |
| `PHOENIX_ADMIN_SECRET` | Bearer token the app sends to Phoenix on trace export. Required when running `docker-compose.yml`; generate separately from `PHOENIX_SECRET` |
| `MCP_ALLOW_DESTRUCTIVE` | Set `true` to enable destructive MCP tools (delete, restore_snapshot). Default: `false` |
| `GITHUB_FEEDBACK_TOKEN` | GitHub personal access token with `issues:write` for the feedback repo |
| `GITHUB_FEEDBACK_REPO` | GitHub repo for feedback issues (e.g., `myorg/myrepo`) |

---

## Public Access (Cloudflare Tunnel)

The app binds only to `127.0.0.1:3000` by default. For secure public access without opening a firewall port:

1. Create a tunnel at the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/)
2. Set `CLOUDFLARE_TUNNEL_TOKEN` in `.env.local`
3. Configure the tunnel to route to `http://localhost:3000`
4. Set `APP_BASE_URL` to the tunnel's public origin (e.g., `https://annie.yourdomain.com`) — the calendar feed and MCP OAuth discovery metadata build their links from it, not from forwarded request headers

The `tunnel` service in `docker-compose.yml` starts automatically alongside the app.

---

## Tracing (Phoenix)

The `phoenix` service in `docker-compose.yml` collects OpenTelemetry traces with auth enabled:

- The app authenticates its trace export with `PHOENIX_ADMIN_SECRET`; Phoenix signs sessions with `PHOENIX_SECRET`. Compose refuses to start until both are set.
- Both come from Docker Compose variable interpolation: your shell environment, a `.env` file beside `docker-compose.yml`, or `docker compose --env-file .env.local`. They are not read from the app's `env_file`.
- The UI is at `http://127.0.0.1:6006`. The default login is `admin@localhost` / `admin`; Phoenix makes you change the password at first login.
- Phoenix sits on a private `telemetry` network shared only with the app, so the tunnel container cannot reach it.
- Tool-call spans record tool name, category, status, and input/output lengths — never tool content.

---

## Development

Use the dev compose file, which builds locally with hot reload:

```bash
# Build and start with hot reload
docker compose -f docker-compose.dev.yml up

# Or in detached mode
docker compose -f docker-compose.dev.yml up -d
```

The dev setup mounts the source directory into the container, so file changes are reflected immediately without rebuilding.

**Run commands inside the container:**

```bash
docker compose exec app npm run test:run      # Tests
docker compose exec app npm run typecheck     # TypeScript
docker compose exec app npm run lint          # ESLint
docker compose exec app npm run build         # Production build check
docker compose exec app npx prisma studio     # Database browser (port 5555)
```

---

## Database

### Location

`./data/word-coach-annie.db` — SQLite file persisted via Docker volume mount. The `data/` directory is also a git repo (`data/.git`) for snapshot management.

### Schema Changes (CRITICAL)

**NEVER run `prisma db push` or `prisma migrate reset` on a database with real data.** These commands can drop and recreate tables, destroying everything.

Safe migration procedure:
```bash
# 1. Write the migration SQL
cat > migration.sql << 'EOF'
ALTER TABLE "SomeTable" ADD COLUMN "newColumn" TEXT;
EOF

# 2. Apply it
docker compose exec app sqlite3 data/word-coach-annie.db < migration.sql

# 3. Update prisma/schema.prisma to match

# 4. Regenerate the client (safe — does not touch the DB)
docker compose exec app npx prisma generate
```

### Staging database role

Staging runs as the `annie_staging` role in the `annie_staging` schema, like its siblings
`reli_staging` and `filmduel_staging` on the same database. Its tables are not in `public`.

Provision it once, as the database admin in `psql`. This is not idempotent; it is meant to
run a single time:

```sql
CREATE ROLE annie_staging LOGIN;
\password annie_staging
-- lets a non-superuser admin (e.g. Supabase's postgres) create a schema owned by the role
GRANT annie_staging TO CURRENT_USER;
CREATE SCHEMA annie_staging AUTHORIZATION annie_staging;
```

Generate the password with `openssl rand -hex 32` (hex, so it needs no URL encoding) and
enter it at the `\password` prompt.

Then, in a single change to the Railway staging service:

- set `DATABASE_SCHEMA=annie_staging`;
- set `DATABASE_URL` to the current URL with only the user and password replaced. Keep the
  host, port and query parameters: production startup refuses a URL without an encrypting
  `sslmode`. On the Supabase pooler the user is `annie_staging.<project-ref>`;
- remove `DIRECT_DATABASE_URL` if it is set.

The staging deploy must already run a `scripts/migrate.mjs` that skips `CREATE SCHEMA IF
NOT EXISTS` for an existing schema; otherwise the first boot fails on the init migration
with `permission denied for database`. That boot applies every migration into
`annie_staging`. Until it holds data, `/api/health` reports `degraded` (HTTP 503), which the
staging monitors tolerate.

The old staging tables stay in `public`, owned by the admin, and can be dropped later.

### Backups

The database is backed up automatically every 6 hours:
- **Local**: `/mnt/steam-fast/backups/annie/` (7-day rotation)
- **Cloud**: Google Drive via rclone (`gdrive:backups/gas-town/annie/`)
- **Failure alerts** (optional): Export `NTFY_URL` in the cron/server environment to receive a push notification via ntfy.sh when the backup git push fails.

Manual backup:
```bash
cp data/word-coach-annie.db data/word-coach-annie.db.bak
```

### Git Snapshots (for MCP safety)

The MCP server takes automatic git snapshots of `data/` before write operations. List and restore snapshots via MCP tools:

```bash
# Via Gemini CLI
gemini -m "@word-coach-annie list_snapshots"
gemini -m "@word-coach-annie restore_snapshot --snapshotId <id>"
```

---

## CI/CD Pipeline

GitHub Actions runs on every push to `main`:

1. **Quality gates** (parallel):
   - TypeScript check (`tsc --noEmit`)
   - Lint (`eslint src/`)
   - Build (`next build`)
   - Tests with coverage (Vitest + `@vitest/coverage-v8`)

2. **Deploy** (only on `main`, after gates pass):
   - Connect to server via Tailscale VPN
   - SSH to `100.120.193.82`
   - Pull latest image + restart containers

3. **Monitoring & alerting** (continuous):
   - `uptime.yml` — polls production and staging health endpoints every 5 minutes; fires ntfy.sh alert on failure
   - `staging-smoke.yml` — runs after every deploy; triggers automatic rollback and ntfy.sh alert if staging health check fails
   - Set the `NTFY_URL` GitHub Actions secret to enable push notifications for both workflows

Branch protection on `main` requires all quality gates to pass.

### Monitoring Secrets (optional)

These secrets enable the backup freshness monitoring job in `.github/workflows/uptime.yml`.
If absent, the job skips silently with a warning.

| Secret | Required | Description |
|--------|----------|-------------|
| `SUPABASE_PROJECT_REF` | No | Supabase project ref for backup freshness monitoring |
| `SUPABASE_ACCESS_TOKEN` | No | Supabase Management API access token for backup freshness monitoring |

---

## MCP Server (for AI Agents)

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "word-coach-annie": {
      "command": "docker",
      "args": ["compose", "exec", "-T", "app", "npx", "tsx", "src/mcp/index.ts"]
    }
  }
}
```

### Gemini CLI

The project root includes a `.gemini/` configuration that auto-connects Gemini CLI to the MCP server:

```bash
gemini   # Run from project root; auto-connects to MCP
```

### Claude Code CLI

The project includes `.claude/settings.json` that auto-connects Claude Code to the MCP server with non-destructive tools pre-approved (no confirmation prompts):

```bash
claude   # Run from project root; auto-connects to MCP
```

### HTTP Proxy

For web-based MCP clients, the app exposes an HTTP MCP proxy at `POST /api/mcp`.

### Destructive Tools

By default, destructive MCP tools (delete operations, `restore_snapshot`) are hidden. Enable them:

```
MCP_ALLOW_DESTRUCTIVE=true
```

---

## Troubleshooting

**Container won't start**: Check `docker compose logs app`. Most common cause: missing required env vars.

**Database errors**: Ensure `./data/` directory exists and is writable. The container creates `word-coach-annie.db` on first start.

**AI chat not working**: Verify `AI_API_KEY` and `AI_API_BASE_URL` are set (or configured in the app UI under Settings → AI).

**Google OAuth failing**: Verify `GOOGLE_REDIRECT_URI` matches exactly what's configured in Google Cloud Console. In local dev, use `http://localhost:3000/api/auth/google/callback`.
