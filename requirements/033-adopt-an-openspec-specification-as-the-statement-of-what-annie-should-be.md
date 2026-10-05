---
created: '2026-09-28'
github_issue: 1173
id: '033'
status: done
title: Adopt an OpenSpec specification as the statement of what Annie should be
updated: '2026-10-05'
---

## Why

Requirement files record changes, not what Annie should be. Auditing the product against them means replaying a change log, and their hand-kept status drifts: many here are recorded wrongly (drafts 016–024, 028 and 029 are already built; 031 is built but still recorded as idea; three files share id 017). A specification per capability, changed only through spec-change pull requests, gives one document to audit against and lets Lachesis derive status from the work itself — the same move Lachesis made in its own requirement 030.

## What

The repository holds Annie's specification in OpenSpec format under openspec/specs/, one file per capability: accounts-and-security, agent-collaboration, ai-assistance, export-and-publishing, manuscript-structure, offline-and-updates, reading-and-sharing, scene-editing, story-world, submissions-and-opportunities, writing-tasks. The spec is validated in CI on every pull request and push to the default branch. From then on, work starts as spec changes, and the existing requirement files are superseded by the spec.

## Issues

- #1173 — Add Annie's OpenSpec specification and validate it in CI