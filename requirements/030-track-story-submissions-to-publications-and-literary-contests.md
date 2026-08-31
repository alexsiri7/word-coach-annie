---
created: '2026-08-30'
github_issue: null
id: 030
status: draft
title: Track story submissions to publications and literary contests
updated: '2026-08-30'
---

## Why

Authors submitting stories to publications and literary contests currently have to track that activity outside Annie (spreadsheets, notes apps, memory), even though Annie already holds the story and every other piece of the author's workflow. There's no way to see, at a glance, where a piece is currently out, what's pending a response, or when a contest result is expected.

## What

Add submission tracking, scoped per project (one story = one project):

- A reusable **Provider** entity (magazine, journal, contest host, etc.) — not tied to any single project — with a name and optional website/notes, so the same provider can be reused across submissions and projects.
- **Publication submissions**: venue name, submission date, and status (submitted / accepted / rejected / withdrawn, or similar) for a project.
- **Contest submissions**: contest name, a Provider reference, submission date, review/result date, submission URL, and status, for a project.
- Full CRUD for all three (Providers, publication submissions, contest submissions) via the web UI, reachable from the project dashboard the same way Annotations and Tasks are today.
- A compact submission-activity summary on the project dashboard (active/pending count, upcoming contest review dates) linking through to the full page.
- Parity via the MCP server, so an AI collaborator can manage a story's submission activity on the author's behalf, not just read it.

## Issues

- #1052 — Data model + API for submission tracking: Providers, publication & contest submissions
- #1053 — Submissions page: full list + management UI, linked from project header
- #1054 — Project dashboard: submission activity summary
- #1081 — Full MCP tool support for submission tracking (Providers, publication & contest submissions)
