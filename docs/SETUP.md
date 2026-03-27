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
| `API_TOKEN` | Strong random token for API authentication. **Required if the app is exposed to the internet.** Generate: `openssl rand -hex 32` |

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

### Security

| Variable | Description |
|----------|-------------|
| `ENCRYPTION_KEY` | Key for encrypting AI API keys at rest. Generate: `openssl rand -hex 32`. Falls back to `API_TOKEN`. |
| `JWT_SECRET` | JWT signing key for Google OAuth sessions. Generate: `openssl rand -hex 32`. Falls back to `API_TOKEN`. |
| `ALLOWED_EMAILS` | Comma-separated list of Google emails allowed to sign in. When unset, any Google account can sign in. |

### Optional

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Tunnel token for public access |
| `MCP_ALLOW_DESTRUCTIVE` | Set `true` to enable destructive MCP tools (delete, restore_snapshot). Default: `false` |
| `GITHUB_FEEDBACK_TOKEN` | GitHub personal access token with `issues:write` for the feedback repo |
| `GITHUB_FEEDBACK_REPO` | GitHub repo for feedback issues (e.g., `myorg/myrepo`) |

---

## Public Access (Cloudflare Tunnel)

The app binds only to `127.0.0.1:3000` by default. For secure public access without opening a firewall port:

1. Create a tunnel at the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/)
2. Set `CLOUDFLARE_TUNNEL_TOKEN` in `.env.local`
3. Configure the tunnel to route to `http://localhost:3000`

The `tunnel` service in `docker-compose.yml` starts automatically alongside the app.

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

### Backups

The database is backed up automatically every 6 hours:
- **Local**: `/mnt/steam-fast/backups/annie/` (7-day rotation)
- **Cloud**: Google Drive via rclone (`gdrive:backups/gas-town/annie/`)

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

Branch protection on `main` requires all quality gates to pass.

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
