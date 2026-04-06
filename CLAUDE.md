# Claude Code Context
Please refer to [docs/RULES.md](docs/RULES.md) for project rules, commands, and documentation.

## Database Safety (CRITICAL)

**NEVER run `prisma db push` or `prisma migrate reset` on the production database.**
These commands can drop and recreate tables, destroying all user data.

The project uses **PostgreSQL** (Supabase) in production. Migrations are managed via
Prisma Migrations (`prisma/migrations/`) and applied automatically on container start
by `scripts/migrate.mjs` (which refuses destructive DDL if the database has live data).

For schema changes:
1. Create migration: `npx prisma migrate dev --name <description>`
2. Review the generated SQL in `prisma/migrations/`
3. Run `npx prisma generate` to regenerate the client

The production database contains real creative work. Always create a database snapshot
(`snapshot_database` MCP tool) before making significant changes.

## Screenshot Tests (Visual Regression)

Screenshot tests ensure agents can assess UI quality. They live in `e2e/visual.spec.ts`.

**Coverage strategy**: one screenshot per screen × {desktop 1280×720, mobile 390×844, dark-desktop 1280×720}. No loading states, no error states — just the normal populated view with mock data.

**When your changes affect the UI:**
1. Run `npm run test:screenshots`
2. If tests fail (expected after UI changes), run `npm run test:screenshots:update`
3. **Visually inspect every updated PNG** in `e2e/visual.spec.ts-snapshots/` — you are multimodal, read the image files and confirm the UI looks correct
4. Commit the updated screenshots alongside your code changes

**If you skip step 3, you are shipping blind.** The screenshots are the visual contract — updating them without inspection defeats the purpose.

## GitHub Issue Linking

PRs MUST reference the GitHub issue they contribute to. This is how we track feature progress.

When creating a PR (or when `gt done` creates one), include in the PR body:
- `Fixes #N` — if the PR fully completes the feature/issue
- `Part of #N` — if the PR is partial progress toward the feature

Current feature issues: https://github.com/alexsiri7/word-coach-annie/issues

If your bead description mentions a GitHub issue number, use it. If not, check the
issues list to see if your work maps to an existing feature issue.
