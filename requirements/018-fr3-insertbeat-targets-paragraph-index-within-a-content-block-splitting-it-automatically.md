---
created: '2026-05-25'
github_issue: null
id: 018
status: draft
title: 'FR3: insert_beat targets paragraph index within a CONTENT block, splitting
  it automatically'
updated: '2026-05-25'
---

## Why

Scenes written as a single CONTENT block are the common case. Without intra-block targeting, `insert_beat` can only append at the scene boundary, making it useless for mid-prose beat placement. The split is a structural operation with no authorial content — Annie can do it safely without triggering the prose-writing concern.

## What

When `insert_beat` receives a `paragraphIndex` that points inside a CONTENT block (rather than between blocks), Annie automatically splits that CONTENT block at the specified paragraph boundary, inserts the BEAT, and reconstructs the block sequence. No prose is written or changed — paragraphs are only repositioned. The caller always works with a single coordinate space (paragraph index across the scene), not block-level offsets.

## Issues

_None yet._