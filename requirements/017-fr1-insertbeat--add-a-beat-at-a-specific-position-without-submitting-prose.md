---
created: '2026-05-24'
github_issue: null
id: '017'
status: draft
title: 'FR1: insert_beat — add a beat at a specific position without submitting prose'
updated: '2026-05-24'
---

## Why

The `write_scene_content` tool cannot distinguish "Claude passing the author's existing prose back unchanged in order to insert a beat" from "Claude generating new prose." A purpose-built operation with a BEAT-only payload removes the ambiguity at the protocol level, and is cleaner API design regardless.

## What

A dedicated `insert_beat(nodeId, afterParagraphIndex, beatContent)` tool exists on the MCP server. It inserts a single BEAT block immediately after the paragraph at `afterParagraphIndex` in the specified scene. The payload contains no CONTENT blocks, so there is no ambiguity about prose authorship. Claude can slot a beat between two existing paragraphs without resubmitting the full scene.

## Issues

_None yet._