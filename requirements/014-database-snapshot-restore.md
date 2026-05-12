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
`snapshot_database`, `list_snapshots`, and `restore_snapshot` MCP tools. Snapshot created before any significant schema or data change.
