# Claude Code Context
Please refer to [docs/RULES.md](docs/RULES.md) for project rules, commands, and documentation.

## Database Safety (CRITICAL)

**NEVER run `prisma db push` or `prisma migrate reset`.** These commands can drop
and recreate SQLite tables, destroying all user data.

For schema changes:
1. Write migration SQL by hand: `ALTER TABLE ... ADD COLUMN ...`
2. Apply it: `sqlite3 data/word-coach-annie.db < migration.sql`
3. Update `prisma/schema.prisma` to match
4. Run `npx prisma generate` (regenerates client only, safe)

The database at `data/word-coach-annie.db` contains real creative work. It is
backed up every 6 hours and version-controlled in `data/.git`.

## GitHub Issue Linking

PRs MUST reference the GitHub issue they contribute to. This is how we track feature progress.

When creating a PR (or when `gt done` creates one), include in the PR body:
- `Fixes #N` — if the PR fully completes the feature/issue
- `Part of #N` — if the PR is partial progress toward the feature

Current feature issues: https://github.com/alexsiri7/word-coach-annie/issues

If your bead description mentions a GitHub issue number, use it. If not, check the
issues list to see if your work maps to an existing feature issue.
