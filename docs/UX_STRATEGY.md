# UX Strategy: Writing-First Experience Redesign

> **Parent issue:** GH#118
> **Status:** Active — phases being implemented iteratively
> **Design spec:** [`docs/ux-design-spec.html`](ux-design-spec.html) (open in browser for interactive mockups)

---

## The Problem

Annie is a feature-rich writing tool that accidentally became a project management tool. The
dashboard is a project picker. The sidebar shows seven tabs of master lists. Every feature
competes with the writing surface for attention.

Writers open Annie to *write*. But today, a returning writer with one active novel clicks
through 3+ screens before reaching their last scene. The app asks them to manage before it
lets them create.

---

## Design Principles

### 1. Writing is the center of gravity
The editor is home. Every navigation decision — default routes, post-action redirects,
one-click affordances — should drop the writer into a scene, not into a management view.

### 2. Context follows the cursor
Show what's relevant to *this scene*. Characters in this chapter, not the project cast list.
Plot threads active here, not all threads. The sidebar becomes a smart context panel rather
than a static browser.

### 3. Progressive complexity
A fresh project needs one thing: a blank scene. Features — story objects, relationships,
timeline, AI tools — should emerge as the manuscript grows, not stack up in the UI from day one.

### 4. Show momentum, not metrics
Word counts are static numbers. A calendar heatmap, a part-by-part progress bar, a "next
unwritten scene" prompt — these communicate *forward progress*. Never gamify. No streaks,
no badges. Just a visual record that the work is happening.

### 5. AI assists the writing, not the interface
The AI chatbot sidebar competes with story objects for space. AI should appear where writing
happens: select text → get options. The AI tab should show contextual writing prompts based
on *this scene's status*, not a generic chat interface.

---

## Implementation Phases

Each phase delivers standalone value. Ordered by impact-to-effort ratio — later phases build
on earlier infrastructure.

---

### Phase 1: Writing Launchpad
*GH#119 — frontend only, no API changes needed*

**Problem:** 3+ clicks before the writer reaches their scene.

**Changes:**
- **Resume Card** — top of dashboard, shows last-edited scene with one-click "Continue writing"
- **Session Tracker** — optional daily word goal; progress bar on dashboard; tracks per-session words
- **Enriched Project Cards** — manuscript progress bar, next unwritten scene link, current scene name
- **Writing-first onboarding** — new wizard flow: genre → project name → structure template → drop into Scene 1

**Success metric:** Returning writer has cursor in a scene within 2 seconds.

**Implementation notes:**
- Last-edited tracking via localStorage (no API needed for MVP)
- Session detection: start on first keystroke, end after 5-min inactivity
- Word count diff captured on save events
- Onboarding wizard replaces current API-key wizard; move API config to Settings

---

### Phase 2: Scene-Aware Context
*GH#120 — Tiptap extension + sidebar refactor*

**Problem:** The sidebar shows master lists when writers need *this scene's* context.

**Changes:**
- **Context Sidebar Tab** — default active when scene is open; shows characters, location, active plotlines for this scene
- **@-Mentions** — type `@` to autocomplete story objects; mention auto-creates scene→object relationship; hover tooltip; click to open panel
- **Beats in Outline Tree** — scene beats (`<!-- beat: ... -->`) shown as indented items in outline tree; color-coded plot thread indicators per scene

**Success metric:** < 20% of writing sessions involve switching to a master-list tab.

**Implementation notes:**
- Context sidebar reads from existing relationship data — no new backend needed
- @-mentions require a Tiptap ProseMirror extension (mention nodes)
- Beat parsing is already done for Focus Mode; extend to outline tree display
- Sidebar tab order change: Context > Characters > Locations > Plotlines > (existing tabs)

---

### Phase 3: Integrated AI Writing Partner
*GH#121 — inline Tiptap actions + scene-aware AI tab*

**Problem:** AI is a sidebar tab separate from the writing surface.

**Changes:**
- **Inline AI Actions** — select text → floating action bar (Rewrite / Continue / Expand / Voice check / Ask Annie); results in floating panel with accept/dismiss
- **Scene-Aware AI Tab** — contextual prompts based on scene status: Outline phase shows "Draft from beats"; Draft phase shows "Pacing check", "Character voice audit"; Revised phase shows "Line edit"
- **Manuscript-Level AI** — accessible from project header or command palette; "Plot thread tracker", "Character arc summary", "Consistency check"

**Success metric:** 60%+ of AI interactions occur within 30 seconds of editing text.

**Implementation notes:**
- Inline actions use existing AI infrastructure (`/api/chat`), scoped to selected text + scene context
- Tiptap selection API for the floating action bar
- Scene-aware prompts map to existing MCP skills (developmental edit, line edit, etc.)
- Mobile: action bar as bottom sheet
- Free-form chat input remains at bottom as fallback

---

### Phase 4: Writing Momentum
*GH#122 — progress tracking + session heatmap*

**Problem:** Writing a novel takes months. Static word counts give no sense of forward progress.

**Changes:**
- **Manuscript Progress View** (`/project/[id]/progress`) — summary cards, part-by-part progress bars (green=Final / blue=mixed / amber=early draft), "Next up" prompt
- **Session Tracking** — auto-detect sessions, track words/hour, show in editor footer
- **Writing Activity Heatmap** — calendar heatmap on dashboard (past 4 weeks), non-gamified
- **Next Scene Flow** — completion toast when marking a scene done, with quick-jump to next scene

**Success metric:** Writers using session tracking write 20%+ more words per week.

**Implementation notes:**
- Session tracking persisted to new `WritingSession` DB table (API-backed for cross-device)
- Progress view reads scene `status` field and word counts — no new data model needed
- Heatmap: group sessions by date, color by word count
- Next scene flow: status change triggers toast component (existing toast infrastructure)

---

### Phase 5: Story Intelligence
*GH#123 — background AI analysis*

**Problem:** Beyond 20,000 words, writers can't maintain consistency without a tool to help.

**Changes:**
- **Consistency Alerts** — background AI analysis; surface contradictions inline (e.g. "Eye colour inconsistency: Ch. 1 says grey, here says blue"); actions: Fix here / Fix in source / Not an error
- **Character Voice Monitor** — optional feedback during dialogue; shows established voice profile; "This reads more like [Character B]"
- **Plot Thread Status in Outline** — colored dot indicators per scene (advancing / mentioned / dormant); warnings for abandoned threads
- **Embeddable Timeline Strip** — compact timeline below editor showing current scene's position; click to jump

**Success metric:** Writers with 50+ scenes report higher consistency confidence.

**Implementation notes:**
- Background analysis requires a processing pipeline (new infrastructure)
- Consistency alerts stored as a new `ConsistencyAlert` table
- Voice monitor builds on existing character arc review MCP skill
- Plot thread dots reuse thread data from existing relationship graph
- Timeline strip is a compact version of the existing Timeline View

---

## UX Patterns

### Scene Status Lifecycle
```
Outline → Draft → Revised → Final
```
Each status change is a writing event. Phase 4's "Next Scene Flow" triggers on status change.
Phase 3's scene-aware AI tab adapts prompts to status.

### Sidebar Tab Priority
After Phase 2:
1. **Context** (default when scene open) — scene-specific characters/location/plotlines
2. **Characters** — full cast list
3. **Locations** — all locations
4. **Plotlines** — all threads
5. (remaining existing tabs...)

### The Editor as Home
Every phase reinforces this: the editor is the starting point, not the dashboard. Progressively:
- Phase 1: Dashboard launches you into the last open scene
- Phase 2: Context follows you into each scene automatically
- Phase 3: AI is in the editor, not a tab you navigate to
- Phase 4: Progress lives in the editor footer and on the path to the next scene
- Phase 5: Intelligence surfaces inside the editor, inline

---

## What We're NOT Building

- **Productivity dashboards** with daily targets, streaks, or badges
- **Generic AI chat** as the primary AI surface (it moves to secondary / fallback)
- **More sidebar tabs** — the context tab replaces tab-switching, it doesn't add to it
- **Separate "analytics" sections** — momentum data appears where the writer already is

---

## Dependencies and Order

| Phase | Depends on | New infrastructure |
|-------|-----------|-------------------|
| Phase 1 | — | localStorage session tracking |
| Phase 2 | Phase 1 (context patterns) | Tiptap mention extension |
| Phase 3 | Phase 2 (scene context) | Floating action bar component |
| Phase 4 | Phase 1 (word count events) | `WritingSession` table, heatmap component |
| Phase 5 | Phase 2 + 3 (relationships, AI), Phase 4 (status tracking) | Background processing pipeline, `ConsistencyAlert` table |

Phases 1–2 are independent of each other and can be parallelised.
Phase 3 is best after Phase 2 (scene context data feeds the AI prompts).
Phase 4 is independent of 2–3.
Phase 5 depends on all prior phases.
