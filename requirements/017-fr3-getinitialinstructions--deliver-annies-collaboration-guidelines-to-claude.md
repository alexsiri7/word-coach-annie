---
created: '2026-05-24'
github_issue: null
id: '017'
status: draft
title: 'FR3: get_initial_instructions — deliver Annie''s collaboration guidelines
  to Claude'
updated: '2026-05-24'
---

## Why

Nothing currently tells Claude that its default role is structural rather than authorial. This knowledge needs to travel with the MCP server so that Claude Code, Archon, and any other integration gets the right behaviour for free, and so the philosophy can be updated in one place.

## What

A `get_initial_instructions` tool exists on the Annie MCP server. It returns static guidelines explaining how Claude should collaborate with Annie: default to structural work (beats, annotations, editorial flags) rather than prose; if the author explicitly asks Claude to write something, do it. The guidelines live in Annie and are picked up automatically by any integration without needing to be maintained in an external system prompt.

## Issues

_None yet._