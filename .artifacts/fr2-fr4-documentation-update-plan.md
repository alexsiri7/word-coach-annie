# Documentation Update Plan: FR2 & FR4 Completion

## Goal
Mark FR2 (Universes) and FR4 (MCP Skills) as completed. Move their specs from
FUTURE_REQUIREMENTS.md into REQUIREMENTS.md, and update the priority/dependency table.

## Changes

### 1. REQUIREMENTS.md — Add FR2 (Universes) to Data Model + Functional Requirements

**Data Model additions:**
- `Universe`: title, description, linked projects, world objects
- `WorldObject`: universe-scoped objects (CHARACTER, LOCATION, WORLD_ELEMENT) with name, description, notes, tags
- `WorldObjectTimelineEntry`: ordered timeline entries tracking world object evolution
- `Project.universeId` (optional): links a project to a universe

**Functional Requirements additions:**
- F10: Universe Management
  - F10.1: Create, rename, delete universes
  - F10.2: Link/unlink projects to/from a universe
  - F10.3: CRUD for world objects (universe-scoped characters, locations, world elements)
  - F10.4: Timeline entries for world objects (add, update, delete, reorder)
  - F10.5: Transfer story objects from a project into a universe as world objects
  - F10.6: Universe detail page with world objects grouped by type and timeline view
  - F10.7: Top-level Universes page alongside Dashboard

### 2. REQUIREMENTS.md — Add FR4 (MCP Skills) to MCP Server + Functional Requirements

**Data Model additions:** (None — skills are file-based, not in DB)

**Functional Requirements additions:**
- F11: MCP Skills Architecture
  - F11.1: Curated `.skills/` directory with writing skill instruction sets (Markdown)
  - F11.2: Skill loader parses YAML frontmatter metadata from SKILL.md files
  - F11.3: Skills registered as MCP Prompts (discoverable via list_prompts, invocable via get_prompt)
  - F11.4: `list_skills` tool returns all available skill metadata
  - F11.5: 6 initial skills: developmental-edit, line-edit, consistency-check, plot-structure-analysis, character-arc-review, scene-drafting-assistant

**Milestones update:**
- Add M7 for FR2 (Universes) — done
- Add M8 for FR4 (MCP Skills) — done

### 3. FUTURE_REQUIREMENTS.md — Remove FR2 and FR4

- Remove the FR2 section (lines 82–165)
- Remove the FR4 section (lines 210–313)
- Remove Appendix A1 (FR2 step-by-step, lines 369–486)
- Remove Appendix A2 (FR4 step-by-step, lines 489–586)
- Update the Priority & Dependencies table
- Update the Decisions Made table (move FR2/FR4 decisions to REQUIREMENTS.md or remove)

### 4. What remains in FUTURE_REQUIREMENTS.md after cleanup
- FR1: Cloud Deployment & Security (still future)
- FR3: Article / Non-Fiction Writing Use Case (still future, next to implement)
- Updated priority table without FR2/FR4
