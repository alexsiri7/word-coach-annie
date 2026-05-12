---
id: "009"
title: "Markdown, PDF, and EPUB export"
status: "done"
github_issue: 610
updated: 2026-05-12
---

## Why
Writers need to share their work outside the app — for editors, beta readers, or self-publishing. Beat annotations should not appear in the final export.

## What
Export to Markdown (full manuscript, per-chapter, or story bible), PDF (via `@react-pdf/renderer`), and EPUB 3 (via `epub-gen-memory`). Beat annotations stripped automatically on all formats.
