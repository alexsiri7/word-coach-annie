---
name: developmental-edit
description: Perform a developmental edit on a scene or chapter — big-picture feedback on structure, pacing, and character development
required_tools:
  - read_scene_content
  - get_story_object
  - list_relationships
  - get_outline
  - list_story_objects
triggers:
  - "developmental edit"
  - "big picture feedback"
  - "structural feedback"
  - "story-level edit"
---

# Developmental Edit

## When to Use

Use this skill when the author wants **structural, story-level feedback** on a scene, chapter, or section of the manuscript. A developmental edit focuses on the big picture — not sentence-level polish.

## Prerequisites

- A project with at least one scene that has written content.
- The `nodeId` of the scene or chapter to analyze (if a chapter is given, analyze all its scenes).

## Steps

1. **Load the outline.** Use `get_outline` with the project ID to understand the full manuscript structure. Note where the target scene/chapter sits relative to the overall arc.

2. **Read the target content.** Use `read_scene_content` on the target node to get the full text. If the target is a chapter, read each child scene in order.

3. **Identify linked story elements.** Use `list_relationships` for the project to find which characters, locations, plotlines, and world elements are connected to the target node.

4. **Load linked story objects.** For each relationship found, use `get_story_object` to load the full details — descriptions, notes, and roles.

5. **Analyze the scene against these criteria:**

   ### 5a. Pacing
   - Does the scene drag in places? Are there unnecessary descriptions or repetitive dialogue?
   - Does it rush through important moments? Are emotional beats given enough space?
   - Is there a clear rhythm of tension and release?

   ### 5b. Character Voice
   - Is each character's dialogue distinct and consistent with their established voice?
   - Do characters act in ways consistent with their described personality and arc?
   - Are character motivations clear and believable?

   ### 5c. Plot Advancement
   - Does this scene move the story forward in a meaningful way?
   - What changes between the beginning and end of the scene? (If nothing changes, the scene may be unnecessary.)
   - Does it connect logically to the scenes before and after it?

   ### 5d. Setting & World-Building
   - Is the location grounded and vivid? Can the reader picture where this takes place?
   - Are world-building elements woven naturally into the action (not info-dumped)?
   - Is the setting consistent with previous descriptions of this location?

   ### 5e. Conflict & Tension
   - Is there a source of tension driving the scene (even if subtle)?
   - Does the conflict connect to the larger story conflicts or character arcs?
   - Is there a sense of stakes — what does the POV character stand to gain or lose?

   ### 5f. Point of View
   - Is the POV consistent throughout the scene?
   - Does the narrative distance feel right for the emotional content?
   - Are there any accidental head-hops or POV breaks?

6. **Compile feedback** into the structured output format below.

## Output Format

```markdown
# Developmental Edit: [Scene/Chapter Title]

## Summary
[2–3 sentence overview of the scene's strengths and primary areas for improvement]

## Pacing
**Rating:** [Strong / Adequate / Needs Work]
[Specific observations with references to passages]

## Character Voice
**Rating:** [Strong / Adequate / Needs Work]
[Specific observations per character appearing in the scene]

## Plot Advancement
**Rating:** [Strong / Adequate / Needs Work]
[What changes in this scene and how it connects to the larger arc]

## Setting & World-Building
**Rating:** [Strong / Adequate / Needs Work]
[Observations on grounding, vividness, consistency]

## Conflict & Tension
**Rating:** [Strong / Adequate / Needs Work]
[Analysis of tension, stakes, and connection to larger conflicts]

## Point of View
**Rating:** [Strong / Adequate / Needs Work]
[POV consistency observations]

## Top 3 Recommendations
1. [Most impactful suggestion]
2. [Second suggestion]
3. [Third suggestion]

## Detailed Notes
[Any additional line-by-line observations worth mentioning at the developmental level]
```

## Tips

- Be specific. Reference actual passages, not vague generalities.
- Frame feedback constructively — identify what's working well before suggesting changes.
- Consider the scene in context. A slow scene after a high-action sequence might be intentional pacing.
- If the scene serves a purpose that isn't immediately obvious, acknowledge that possibility.
