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
