# UX Strategy

How writers should experience Word Coach Annie — from first project to daily writing habit.

This document complements [REQUIREMENTS.md](REQUIREMENTS.md) (what Annie does) and [FUTURE_REQUIREMENTS.md](FUTURE_REQUIREMENTS.md) (where Annie is going) by focusing on how the product should *feel* and what design decisions get us there.

## The core UX tension

Annie is a writing tool with powerful story management features — characters, locations, plotlines, timelines, universes, AI assistance. But writers don't open a writing app to *manage* — they open it to *write*. Every feature that isn't prose composition is friction unless it demonstrably serves the writing. The UX must keep the blank page front-and-center while making story management feel like a natural extension of the writing process, not a separate activity.

**The danger:** Annie becomes Notion-for-novels — impressive feature list, but writers spend more time organizing than writing. The antidote is ruthless focus on the writing surface and progressive disclosure of everything else.

## Design principles

1. **Writing is the center of gravity.** The editor is home. Every other feature exists to serve the writing, and should be reachable without leaving the writing surface. If a writer has to navigate away to do something, we've failed.
2. **Context follows the cursor.** When writing a scene, show the characters *in this scene*, the location *of this scene*, the plot threads *active in this scene*. Not a master list. Focus mode already demonstrates this pattern — it should be the default, not a special mode.
3. **Progressive complexity.** Start with just an editor and an outline. Characters, relationships, timelines, universes, and AI features emerge as the manuscript grows. Don't front-load a feature tour — let the writer discover tools when they need them.
4. **Show momentum, not metrics.** Writers are motivated by forward progress — words written today, scenes completed, the manuscript taking shape. Surface this naturally without turning writing into a productivity dashboard.
5. **AI assists the writing, not the interface.** The AI should feel like a writing partner who knows your story, not a chatbot in a sidebar. It should offer scene-level insight, catch inconsistencies, and help when you're stuck — in context, not in a separate conversation.

---

## Phase 1: Writing launchpad

**Problem:** The dashboard is a project picker. A writer with one active novel (the majority case) clicks through the dashboard, selects a scene, and then starts writing. That's 3+ clicks before any words appear. The app should meet the writer where they left off.

### Resume where you left off

When a writer opens Annie, show a "continue writing" prompt at the top of the dashboard:

```
Continue writing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The Amber Throne — Chapter 3: War Council
Last edited 2 hours ago · 1,400 words · Draft status
[Open in Editor]  [Open in Focus Mode]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

One click to resume. The most recent scene in the most recently edited project. The writer is back in their manuscript in under 2 seconds.

### Today's writing session

Below the resume card, show a lightweight session tracker:

```
Today: 847 words written across 2 sessions
Goal: 1,000 words/day  [████████░░] 85%
```

The daily goal is optional and user-configurable. When set, it provides gentle motivation without gamification pressure. No streaks, no badges — just "here's where you are today."

### Project cards with writing context

Enrich the existing project cards with writing-relevant info:

- **Current scene** — show which scene was last edited, not just the project title
- **Manuscript progress** — "12 of 24 scenes drafted" or a subtle progress bar
- **Next unwritten scene** — "Next up: Chapter 4, Scene 1 (Outline)" as a quick-jump link

### First-run experience

Replace the API-key-focused setup wizard with a writing-first onboarding:

1. "What are you writing?" — Fiction, articles, or general. This sets the terminology.
2. "Give it a name" — Create the first project.
3. "How is it structured?" — Offer templates: Novel (Parts > Chapters > Scenes), Short Story (Scenes only), Article Collection (Articles > Sections). Pre-populate structure.
4. Drop the writer into Scene 1 of their new project, in focus mode.

API configuration can happen later, in settings, when the writer actually wants AI features. Don't gate the writing experience behind infrastructure setup.

### Success metric

A returning writer should have their cursor in a scene within 2 seconds of opening the app. A new writer should be writing within 60 seconds.

---

## Phase 2: Scene-aware context

**Problem:** The main editor view has a sidebar with 7 tabs (Outline, Characters, Locations, Plotlines, World, Notes, AI). These are all master lists. When writing the throne room scene, the writer doesn't need to see *every* character — they need to see Queen Mira and the court advisor. Focus mode already solves this beautifully. The main editor should learn from it.

### Bring focus mode's context to the main editor

The focus mode's three-panel layout (scene info | editor | related elements) is the strongest screen in the app. But it's a separate route that requires navigation. Instead:

- Make the "Related" panel available as a sidebar option in the main editor view
- When a scene is selected, default the sidebar to showing related elements (characters, locations, plotlines linked to this scene), not the outline
- The outline remains accessible via its tab, but context is the default

### Scene-aware story object display

In the sidebar, distinguish between "in this scene" and "in this project":

```
CHARACTERS IN THIS SCENE (2)
  Queen Mira — Protagonist
  Lord Ashford — Antagonist

OTHER CHARACTERS (5)
  ▸ Show all...
```

The "in this scene" section is primary. Other story objects are one click away but don't clutter the writing context.

### @-mentions in the editor

Allow writers to reference story objects inline:

- Type `@` in the editor to get an autocomplete dropdown of characters, locations, and plotlines
- Mentions render as subtle highlighted text (not obtrusive links)
- Hovering a mention shows a tooltip with the object's description
- Clicking a mention opens the detail panel for that object
- Mentions automatically create relationships between the scene and the referenced object

This is powerful because it makes relationship-building a natural byproduct of writing, not a separate data-entry task.

### Beat visibility in the outline

Scene beats (`<!-- beat: ... -->`) currently only show inside the editor. Surface them in the outline tree:

```
▼ Chapter 3: The Road North
  📄 Departure at Dawn          ● 0 words  Outline
     → Beat: Kael discovers the map is fake
     → Beat: Confrontation with the merchant
     → Beat: Decision to continue anyway
  📄 The Mountain Pass           ● 0 words  Outline
     → Beat: Storm forces a detour
```

Writers use beats to plan scenes before writing them. Showing beats in the outline turns it into a structural overview of the entire manuscript — visible at a glance without opening each scene.

### Success metric

Writers should be able to see all relevant context for their current scene without switching tabs. Measure: percentage of writing sessions where the writer switches to a master-list tab (target: <20% of sessions).

---

## Phase 3: Integrated AI writing partner

**Problem:** The AI chat is a sidebar tab that competes with story objects for space. It's a general-purpose chat, not a writing-aware assistant. The AI should meet the writer in the writing context — offering scene-level help, inline suggestions, and manuscript-aware feedback.

### Inline AI actions

Select text in the editor to get a floating AI action menu:

- **Rewrite** — rephrase the selected passage (tone options: tighter, more vivid, simpler)
- **Continue** — generate a continuation from the selection point
- **Expand** — elaborate on the selected passage
- **Dialogue check** — "Does this sound like [character]?"
- **Ask Annie** — free-form question about the selection

Results appear in a floating panel below the selection. Accept, modify, or dismiss. No sidebar switching required.

### Scene-level AI panel

Replace the generic chat tab with a scene-aware AI panel that offers contextual prompts:

**For empty scenes (Outline status):**
```
This scene has 3 beats planned. Want me to:
  [Draft from beats]  [Suggest an opening line]  [Expand the beat outline]
```

**For scenes in progress (Draft status):**
```
War Council — 1,400 words, Draft
  [What's working?]  [Pacing check]  [Character voice audit]
  [Continue from here]  [Suggest a scene ending]
```

**For completed scenes (Revised/Final):**
```
Throne Room — 1,800 words, Final
  [Developmental edit]  [Line edit]  [Consistency check]
```

These map to Annie's existing MCP skills (developmental edit, line edit, consistency check, character arc review, scene drafting) but are surfaced contextually instead of requiring the writer to know they exist.

### Manuscript-level AI

Beyond scene-level assistance, offer project-wide AI features accessible from the header:

- **Plot thread tracker** — "Which plot threads are active? Which have gone dormant?"
- **Character arc summary** — "Where is [character] in their arc? What's unresolved?"
- **Consistency check** — "Are there contradictions in character descriptions, timeline, or world rules?"
- **Manuscript summary** — AI-generated synopsis of the manuscript so far

These run against the full project context and surface results as a report, not a chat conversation.

### Chat stays, but evolves

The free-form AI chat remains for open-ended brainstorming ("What if the antagonist is actually her brother?"). But it moves from a sidebar tab to a floating panel (similar to Cmd+K) that can be summoned anywhere without disrupting the layout.

### Success metric

AI features should be used *during* writing sessions, not as a separate activity. Measure: percentage of AI interactions that occur within 30 seconds of editing text (target: 60%+).

---

## Phase 4: Writing momentum

**Problem:** Writing a novel is a months-long endeavor. Writers frequently lose motivation, get stuck, or abandon projects. Annie currently shows word counts as static numbers. The app should help writers feel and see their progress.

### Manuscript progress visualization

Add a manuscript-level progress view accessible from the project header:

```
The Amber Throne — Manuscript Progress
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
12 of 24 scenes · 42,500 of ~80,000 words (estimated)

Part 1: The Summons        [████████████] 100% — 3/3 scenes Final
Part 2: The Road North     [████████░░░░]  67% — 2/3 scenes Draft
Part 3: The Amber Court    [████░░░░░░░░]  33% — 2/6 scenes Outline
Part 4: The Return         [░░░░░░░░░░░░]   0% — 0/4 scenes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Progress is measured by scene status, not just word count. A scene in "Final" status contributes more to progress than one in "Draft." This rewards revision, not just word production.

### Writing session tracking

Track writing sessions automatically (start when the writer begins typing, end after 5 minutes of inactivity):

- Words written this session
- Session duration
- Words per hour (shown subtly, not as a pressure metric)

Surface this in the editor footer alongside the existing word count:

```
1,800 words  ·  Session: 423 words in 45 min
```

### "Next scene" flow

When a writer finishes a scene (marks it as Draft/Revised/Final), offer a natural transition:

```
Scene completed! War Council → Draft (1,400 words)
  [Next scene: Departure at Dawn]  [Back to outline]  [Take a break]
```

This reduces the friction between "finishing one scene" and "starting the next" — a critical flow for maintaining momentum during drafting sprints.

### Writing history

A simple calendar heatmap on the dashboard showing writing activity over the past month. Not gamified (no "streaks" or "don't break the chain"). Just a visual record that says "you've been showing up."

### Success metric

Writers who use session tracking should write 20%+ more words per week than those who don't, measured by voluntary opt-in cohort.

---

## Phase 5: Story intelligence

**Problem:** As a manuscript grows beyond 20,000 words, the writer can't hold the entire story in their head. Annie has the story graph and timeline views, but they're separate pages that require navigation. Story intelligence should be woven into the writing experience.

### Consistency alerts

Surface potential inconsistencies as non-intrusive warnings in the editor margin:

```
⚠️ In Chapter 1, Lord Ashford has "grey eyes." Here you wrote "blue eyes."
   [Fix here]  [Fix in Chapter 1]  [Not an error]
```

These run in the background using Annie's AI and relationship data. They appear as subtle margin indicators, not blocking modals. The writer can address them immediately or dismiss them.

### Character voice monitor

When writing dialogue, offer real-time feedback on character voice consistency:

```
💬 This line reads more like Queen Mira than Lord Ashford.
   Ashford's established voice: formal, clipped, military metaphors.
   [Revise]  [Keep as-is]  [Update voice profile]
```

This builds on the existing "character arc review" MCP skill but surfaces it inline during dialogue writing.

### Plot thread status in the outline

Augment the outline with visual indicators for plot thread activity:

```
▼ Chapter 3: The Road North
  📄 Departure at Dawn
     🔵 The Lost Heir (active — advancing)
     🟡 The Merchant's Debt (mentioned — not resolved)
  📄 The Mountain Pass
     🔵 The Lost Heir (active — complication)
     ⚪ The Amber Prophecy (dormant since Ch. 1)
```

This helps writers track which threads need attention without maintaining a separate document.

### Enhanced timeline view

Make the timeline view embeddable as a panel alongside the editor, not just a separate page. A compact timeline strip at the bottom of the editor showing where the current scene falls in the story chronology, with markers for key events.

### Success metric

Writers with 50+ scenes should report higher confidence in manuscript consistency. Measure: self-reported "I feel in control of my story" rating in optional feedback.

---

## Cross-cutting concerns

### Progressive disclosure

Don't show everything at once. Features should appear as the manuscript grows:

| Manuscript state | Unlocked feature |
|-----------------|-----------------|
| 0 scenes | Writing-first onboarding, basic editor |
| 1+ scenes | Beat planning, scene synopses |
| 3+ scenes | Outline navigation becomes useful |
| 5+ characters/locations | Related elements panel, @-mentions |
| 10+ scenes | Manuscript progress visualization |
| 20+ scenes | Plot thread tracking, consistency alerts |
| 50+ scenes | Story graph, timeline view, full analytics |

The UI should adapt to the manuscript's maturity, not present every feature on day one.

### The editor toolbar

The current toolbar mixes formatting, structure, meta-actions, and state in a single row. Reorganize by frequency:

- **Always visible:** B, I, U, headings, lists, quotes (formatting)
- **Contextual:** Beat markers (when in scene), annotations (when reviewing)
- **Overflow:** Undo/redo, version history, status (accessible but not competing for space)
- **Keyboard-first:** Focus mode (Cmd+Enter), save (Cmd+S), search (Cmd+K)

### Mobile experience

Annie's primary audience is desktop writers, but mobile matters for two use cases:

1. **Quick capture** — jot down an idea, a line of dialogue, or a beat while away from the desk
2. **Reading/reviewing** — re-read scenes on a phone or tablet

Optimize mobile for these cases, not full manuscript editing:
- Swipe-based scene navigation
- Quick-add beat/note from anywhere
- Read-only prose view with comfortable typography
- AI chat for brainstorming on the go

### Dark mode as the default writing environment

The current dark mode is well-implemented. Consider making it the default for the editor (not the dashboard), since many writers prefer dark environments for long writing sessions. The dashboard can follow system theme.

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Search / command palette |
| `Cmd+Enter` | Toggle focus mode |
| `Cmd+S` | Save (already works) |
| `Cmd+/` | Open AI assistant panel |
| `Cmd+Shift+B` | Toggle sidebar |
| `@` | Insert story object mention |
| `Cmd+.` | Next scene |
| `Cmd+,` | Previous scene |
| `Esc` | Close panels / exit focus mode |

---

## Implementation notes

This strategy is designed to be implemented incrementally alongside the engineering roadmap. Some mappings:

| UX Phase | Depends on |
|----------|-----------|
| Phase 1 (Writing launchpad) | Frontend only — last-edited tracking, session storage |
| Phase 2 (Scene-aware context) | Relationship data (exists), frontend refactoring of sidebar |
| Phase 3 (AI writing partner) | MCP skills (exist), AI chat infrastructure (exists), inline UI work |
| Phase 4 (Writing momentum) | Session tracking (new), manuscript progress calculation |
| Phase 5 (Story intelligence) | AI analysis pipelines, consistency checking (new), background processing |

Each phase delivers standalone value. A writer benefits from Phase 1 even if Phase 5 is months away. The phases are ordered by impact-to-effort ratio — the writing launchpad and scene-aware context are high-impact, moderate-effort changes that make the existing features dramatically more accessible.
