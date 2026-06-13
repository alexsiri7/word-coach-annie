---
created: '2026-06-12'
github_issue: null
id: '021'
status: draft
title: Offline mode — write anywhere, sync when back online
updated: '2026-06-12'
---

## Why

Writing sessions shouldn't be interrupted by connectivity loss. A coffee shop, train, or plane with patchy wifi currently means no access to manuscripts, and any typing done outside the app is lost context. Annie requires connectivity for every read and write, making it fragile anywhere network conditions aren't perfect.

## What

Writers can open Annie while offline and still see their projects, chapters, and scene content from the last time the app was online. Writers can continue editing scenes while offline; changes are saved locally and synced automatically the moment connectivity is restored. A persistent sync status indicator in the app header shows one of: up to date, offline (with pending change count), syncing, or conflict. When offline edits conflict with server state (content hash mismatch on sync), the app surfaces both versions in an inline diff and asks the writer to choose one — it never silently discards work.

## Issues

_None yet._