---
name: outline-review
description: Review a scene outline for structural clarity — scene goal, conflict, stakes, and role in the story arc
required_tools:
  - get_scene_focus
  - get_outline
  - list_story_objects
  - get_story_object
  - list_relationships
triggers:
  - "outline review"
  - "scene outline feedback"
  - "outline coaching"
  - "plot structure review"
---

# Outline Review

## When to Use

Use this skill when the author has a scene in OUTLINE status — a synopsis and linked story elements exist, but no prose has been written yet. The goal is to evaluate whether the scene's plan is structurally sound before the author invests time drafting.

## Prerequisites

- A scene with status OUTLINE that has a synopsis.
- Linked story objects (characters, plotlines, locations) for best results.

## Steps

1. **Load scene focus.** Use `get_scene_focus` to get the scene's synopsis, status, linked characters, locations, plotlines, adjacent scenes, and open annotations.

2. **Load the outline.** Use `get_outline` with the project ID to see where this scene sits in the manuscript structure. Note what comes before and after.

3. **Load linked story elements.** Use `list_relationships` for the scene, then `get_story_object` for each linked character, plotline, and location to understand what's at play.

4. **Analyze the outline against these criteria:**

   ### 4a. Scene Goal
   - Does the synopsis clearly state what this scene accomplishes?
   - Is there a single, identifiable purpose (advance plot, reveal character, build tension, provide information)?
   - Could someone draft this scene from the synopsis alone?

   ### 4b. Conflict & Stakes
   - Is there a source of conflict (external or internal)?
   - What does the POV character want in this scene? What opposes them?
   - Are the stakes clear — what happens if the character fails?

   ### 4c. Character Purpose
   - Does each linked character have a reason to be in this scene?
   - Are character goals in this scene consistent with their arc?
   - Is the POV character identifiable from the synopsis?

   ### 4d. Story Arc Position
   - Does this scene connect logically to the previous scene?
   - Does it set up the next scene?
   - Does it advance at least one plotline?
   - Is anything redundant with adjacent scenes?

   ### 4e. Missing Elements
   - Are there characters, locations, or plotlines that should be linked but aren't?
   - Is the synopsis missing key information the drafter would need?
   - Are there open annotations that should be addressed before drafting?

5. **Compile feedback** into the structured output format.

## Output Format

```markdown
# Outline Review: [Scene Title]

## Synopsis Assessment
[Is the synopsis clear and draftable? One-paragraph evaluation.]

## Scene Goal
**Clarity:** [Clear / Partially Clear / Unclear]
[What the scene appears to accomplish, and whether that's well-defined]

## Conflict & Stakes
**Present:** [Yes / Partial / Missing]
[What the conflict is, or what's missing]

## Character Purpose
| Character | Role in Scene | Arc Connection |
|-----------|---------------|----------------|
| [name]    | [what they do] | [how it fits their arc] |

## Story Arc Position
**Preceding Scene:** [title] — [how this scene follows from it]
**Following Scene:** [title] — [how this scene sets it up]
**Plotlines Advanced:** [which plotlines move forward]

## Readiness to Draft
**Ready:** [Yes / Almost / Not Yet]

### Before Drafting, Consider:
1. [Most important thing to clarify or add]
2. [Second item]
3. [Third item, if applicable]

## Strengths
[What's working well in the outline]
```

## Tips

- Do NOT critique prose — there is none. Focus entirely on structure and planning.
- A good scene outline answers: Who is here? What do they want? What goes wrong? What changes?
- Encourage the author to strengthen the synopsis rather than jump to drafting if the outline is unclear.
- Some scenes are deliberately quiet (interludes, transitions). Acknowledge this rather than demanding high conflict in every scene.
