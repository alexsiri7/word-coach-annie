---
created: '2026-05-28'
github_issue: null
id: 019
status: draft
title: 'MCP peer review tools: run, read results, and inspect prompts'
updated: '2026-05-28'
---

## Why

The web frontend has a Peer Review feature that runs three agents (acquisitions editor, fan reader, peer author) in parallel and stores the results as a PeerReview record. From the MCP, Claude can only invoke the review personas as MCP Prompts — it cannot trigger a new review run, read previously stored results, or inspect the prompt text driving each persona. This means peer review is invisible to any agentic workflow outside the browser. Additionally, the persona prompt strings are currently duplicated between mcp/index.ts and api/chat/route.ts, which will drift over time.

## What

Three new MCP tools are available on the Annie server:

1. `run_peer_review(projectId)` — triggers a peer review for the given project, equivalent to clicking the Peer Review button in the web UI. It calls the same backend service that the frontend uses, waits for all three agents to complete, and returns the newly created PeerReview record (id, projectId, publisher, reader, writer, consensus, createdAt). If a review is already in progress it returns the pending record.

2. `get_peer_reviews(projectId, limit?)` — returns the stored peer review records for a project, ordered newest-first. Default limit is 5. Each record includes all four result fields (publisher, reader, writer, consensus) as structured objects, not opaque blobs. Claude can use this to surface any past review without running a new one.

3. `get_peer_review_prompts()` — returns the full prompt/lens text for each of the three reviewer personas (editor, fan, author) as a structured object, keyed by persona name. The prompts are sourced from a shared constants module so that mcp/index.ts and api/chat/route.ts both draw from the same single source of truth rather than duplicating the strings.

The persona lens strings are extracted from mcp/index.ts into a shared module (e.g. lib/review-personas.ts), analogous to how REVIEW_SKILL_BY_STATUS lives in lib/review-routing.ts. Both mcp/index.ts and api/chat/route.ts import from this shared module.

## Issues

_None yet._