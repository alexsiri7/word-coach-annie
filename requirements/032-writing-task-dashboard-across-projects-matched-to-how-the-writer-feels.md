---
created: '2026-09-27'
github_issue: 1148
id: '032'
status: idea
title: Writing task dashboard across projects, matched to how the writer feels
updated: '2026-09-27'
---

## Why

Writing tasks exist in Annie but are scoped to a single project, so neither Alex nor Claude can see everything on his plate at once. The existing energy field (Introspective/Dramatic/Technical) describes the kind of writing, not the writer's state, so on days when Alex isn't mentally ready to draft there's no way to find something useful he *can* do (reading, gathering material, admin, adjacent craft). Contest deadlines live in opportunities and never surface alongside tasks. Claude has to be re-briefed on tasks every session instead of knowing them. The dashboard should serve two moments: sitting down to write and choosing what to do, and feeling stuck and looking for something doable.

## What

- A dashboard page in the Annie web UI shows writing tasks across all projects in one place.
- At the top, a "how are you today?" picker (capacity: Low / Medium / Full) filters everything below it to tasks that fit that state.
- An "upcoming deadlines" strip shows contest/opportunity deadlines and any tasks with due dates, soonest first.
- A "suggested now" section proposes a small number of tasks matching the chosen capacity, prioritising importance and nearness of deadline.
- Tasks are also shown grouped by project, with a small "done this week" section for momentum.
- Tasks carry a kind (Draft, Revise, Read, Gather, Admin) and a capacity level in addition to the existing importance, size and energy, so non-writing work (reading a collection, collecting found phrases, tidying the story bible) is first-class.
- Tasks can exist without a project (practice-level tasks), and can optionally have a due date.
- Claude can fetch the same cross-project dashboard through a single MCP call, optionally filtered by capacity, kind or project, and Annie's initial instructions tell Claude to call it at the start of a session.
- During coaching, Claude can create tasks linked to a scene; these are always tasks for Alex to do himself (Claude captures, never writes the prose).

## Issues

- #1148 — Extend writing task model: kind, capacity, due date, optional project
- #1149 — Add cross-project get_task_dashboard MCP tool
- #1150 — Suggestion ranking for 'suggested now'
- #1151 — Dashboard page in Annie web UI
- #1152 — Update Annie initial instructions: fetch dashboard at session start, capture tasks during coaching