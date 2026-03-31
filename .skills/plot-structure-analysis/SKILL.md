---
name: plot-structure-analysis
description: Analyze story structure against narrative frameworks (3-act structure, hero's journey, Save the Cat, etc.)
required_tools:
  - get_outline
  - read_scene_content
  - list_story_objects
  - get_story_object
  - list_relationships
  - get_project_summary
triggers:
  - "plot structure"
  - "story structure"
  - "three act structure"
  - "hero's journey"
  - "plot analysis"
  - "save the cat"
---

# Plot Structure Analysis

## When to Use

Use this skill when the author wants to evaluate how their story maps to established narrative frameworks. This helps identify structural gaps, pacing issues, and missing story beats.

## Prerequisites

- A project with an established outline (parts/chapters/scenes).
- At least some scenes with written content.
- Story objects (especially plotlines and characters) defined for best results.

## Steps

1. **Get project overview.** Use `get_project_summary` to understand the scope — total word count, number of scenes, story object counts.

2. **Load the outline.** Use `get_outline` to see the full manuscript structure with word counts per section.

3. **Load plotlines and characters.** Use `list_story_objects` filtered by type PLOTLINE and CHARACTER to understand the story threads and character arcs.

4. **Read key scenes.** Use `read_scene_content` to read at minimum:
   - The opening scene(s)
   - Any scene that appears to be a turning point based on title/synopsis
   - The midpoint scene(s)
   - The climax scene(s)
   - The closing scene(s)

5. **Map to narrative frameworks:**

   ### 5a. Three-Act Structure
   - **Act 1 (Setup — ~25% of word count):**
     - Hook / Opening Image — Does the opening grab attention?
     - Inciting Incident — What disrupts the protagonist's status quo?
     - First Act Turning Point — What locks the protagonist into the story?
   - **Act 2 (Confrontation — ~50% of word count):**
     - Rising Action — Are stakes escalating?
     - Midpoint — Is there a significant shift/reversal at ~50%?
     - Pinch Points — Are there moments of increased pressure?
     - Second Act Turning Point — What makes the climax inevitable?
   - **Act 3 (Resolution — ~25% of word count):**
     - Climax — Does the protagonist face the central conflict directly?
     - Resolution — Are plot threads resolved satisfactorily?
     - Final Image — How has the world/character changed from the opening?

   ### 5b. Hero's Journey (if applicable)
   - Ordinary World → Call to Adventure → Refusal → Meeting the Mentor → Crossing the Threshold → Tests/Allies/Enemies → Approach → Ordeal → Reward → Road Back → Resurrection → Return with Elixir

   ### 5c. Save the Cat Beats (if applicable)
   - Opening Image → Theme Stated → Setup → Catalyst → Debate → Break into Two → B Story → Fun and Games → Midpoint → Bad Guys Close In → All Is Lost → Dark Night of the Soul → Break into Three → Finale → Final Image

6. **Analyze pacing distribution.** Calculate what percentage of the total word count each act/section represents. Flag significant deviations from standard ratios.

7. **Compile analysis** into the structured output format.

## Output Format

```markdown
# Plot Structure Analysis: [Project Title]

## Project Overview
- **Total Word Count:** [N]
- **Structure:** [N] parts, [N] chapters, [N] scenes
- **Primary Genre/Type:** [if discernible]

## Three-Act Structure Mapping

### Act 1: Setup (Target: ~25%)
**Actual Coverage:** [N]% ([start scene] → [end scene])
| Beat | Status | Scene(s) | Notes |
|------|--------|----------|-------|
| Opening Hook | ✅/⚠️/❌ | [scene] | [notes] |
| Inciting Incident | ✅/⚠️/❌ | [scene] | [notes] |
| First Turning Point | ✅/⚠️/❌ | [scene] | [notes] |

### Act 2: Confrontation (Target: ~50%)
**Actual Coverage:** [N]% ([start scene] → [end scene])
| Beat | Status | Scene(s) | Notes |
|------|--------|----------|-------|
| Rising Stakes | ✅/⚠️/❌ | [scenes] | [notes] |
| Midpoint Reversal | ✅/⚠️/❌ | [scene] | [notes] |
| Second Turning Point | ✅/⚠️/❌ | [scene] | [notes] |

### Act 3: Resolution (Target: ~25%)
**Actual Coverage:** [N]% ([start scene] → [end scene])
| Beat | Status | Scene(s) | Notes |
|------|--------|----------|-------|
| Climax | ✅/⚠️/❌ | [scene] | [notes] |
| Resolution | ✅/⚠️/❌ | [scene] | [notes] |
| Final Image | ✅/⚠️/❌ | [scene] | [notes] |

## Pacing Analysis
[Visual representation of word count distribution and observations on pacing]

## Missing or Weak Beats
1. [Most critical missing beat and its impact]
2. [Second missing beat]
3. [Third, if applicable]

## Structural Strengths
[What the story does well structurally]

## Recommendations
1. [Top structural recommendation]
2. [Second recommendation]
3. [Third recommendation]
```

## Tips

- Not every story fits neatly into a framework. Use frameworks as diagnostic tools, not rigid rules. If the story breaks a "rule" and it works, say so — then explain *why* it works despite the deviation.
- Pacing percentages are guidelines, not laws. A 30/40/30 split isn't inherently wrong.
- Some genres have their own structural conventions (romance has a "meet cute", mystery has "red herring" rules). Account for genre when analyzing.
- If the manuscript is early (outline-only), focus on structural analysis rather than scene-level beats.
- When the structure is strong, get excited about it. A well-placed midpoint reversal or a perfectly timed dark moment deserves recognition — name the craft, not just the beat.
