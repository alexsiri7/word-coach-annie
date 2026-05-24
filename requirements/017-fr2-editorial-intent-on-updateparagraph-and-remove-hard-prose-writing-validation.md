---
created: '2026-05-24'
github_issue: null
id: '017'
status: draft
title: 'FR2: Editorial intent on update_paragraph and remove hard prose-writing validation'
updated: '2026-05-24'
---

## Why

The blanket prose-writing guard blocks legitimate operations and overrides author agency. A flag-based approach encodes meaningful intent at the protocol level without enforcing it. Removing the hard validation means the author can ask Claude to write prose when they want to — the guideline exists to shape default behaviour, not to prohibit.

## What

An optional `intent: 'editorial'` flag exists on `update_paragraph`, signalling that the author's words are being corrected or rearranged rather than replaced with AI-generated prose. The hard rejection of CONTENT blocks in `write_scene_content` is removed. The author remains in control — if they explicitly ask Claude to write something, that is their choice. Annie's collaboration philosophy is expressed via `get_initial_instructions` instead of server-side validation.

## Issues

_None yet._