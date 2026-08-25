---
created: '2026-08-25'
github_issue: 1000
id: '026'
status: idea
title: Inline spelling and grammar checking in the scene editor
updated: '2026-08-25'
---

## Why

Annie has no spelling or grammar checking today — not even the browser's native spellcheck attribute is enabled on the editor. Authors currently have to rely on the AI proofreading peer-review persona, which is a full manual review pass rather than live, in-the-moment feedback while drafting. A lightweight, always-available inline checker closes that gap. Given Annie's offline-first architecture (local content cache, sync queue, service worker), checking should run client-side rather than depend on a network call, so it works offline and keeps manuscript text private.

## What

While writing prose in the scene editor, misspelled words and grammatical issues (subject-verb agreement, punctuation, awkward phrasing, etc.) are visually flagged inline as the author types, similar to a native word processor. Hovering or clicking a flagged span shows the issue and one or more suggested corrections the author can accept with a click, or dismiss. Checking runs entirely on-device — it works fully offline and no manuscript text is ever sent to an external service. The author can toggle checking on/off per session, and flags never block saving, autosave, or any existing editor action — this is advisory only, never a hard validation gate, consistent with Annie's principle that authors remain in control of their prose.

## Issues

- #1000 — Add harper.js and validate WASM linting performance in the editor context
- #1001 — Build Tiptap extension for inline flagging and suggestion UI
- #1002 — Add per-session on/off toggle for spelling and grammar checking