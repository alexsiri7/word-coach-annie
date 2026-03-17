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
