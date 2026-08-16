---
created: '2026-08-16'
github_issue: null
id: '023'
status: draft
title: create_relationship should accept universe world objects when project is linked
  to a universe
updated: '2026-08-16'
---

## Why

create_relationship's fromObjectId/toObjectId currently only accept project-local story objects, even when the project is linked to a universe. This forces authors into workarounds (e.g. duplicating universe entities locally) instead of relating scenes/characters directly to shared universe canon. This is the real fix, not a routing-around patch.

## What

When a project is linked to a universe, authors can create a relationship directly between a project-local story object (character, location, plotline, etc.) and a world object belonging to that linked universe — not only between two project-local objects. Relationships resolve correctly in both directions (local → universe object and universe object → local).

## Issues

_None yet._