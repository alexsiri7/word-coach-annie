---
id: "014"
title: "Database snapshot and restore"
status: "done"
github_issue: 610
updated: 2026-05-12
---

## Why
Destructive operations (bulk edits, migrations) risk data loss. Writers' creative work must be protected.

## What
Superseded (#1379): the `snapshot_database`, `list_snapshots`, and `restore_snapshot` MCP tools were removed after the move to Supabase PostgreSQL, because a whole-database restore would roll back every user's data. Agents undo scene edits with `get_scene_versions` / `restore_scene_version`; whole-database recovery is Supabase point-in-time recovery.
