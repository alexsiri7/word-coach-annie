---
name: consistency-check
description: Cross-reference world elements, characters, and settings for contradictions across the manuscript
required_tools:
  - get_outline
  - read_scene_content
  - list_story_objects
  - get_story_object
  - list_relationships
  - export_story_bible
triggers:
  - "consistency check"
  - "continuity check"
  - "find contradictions"
  - "world consistency"
---

# Consistency Check

## When to Use

Use this skill when the author wants to verify that their manuscript is internally consistent — no contradictions in character details, timeline, setting descriptions, or world-building rules.

## Prerequisites

- A project with multiple scenes and story objects defined.
- Works best when characters, locations, and world elements have descriptions and relationships set up.

## Steps

1. **Export the story bible.** Use `export_story_bible` to get a complete reference of all characters, locations, plotlines, and world elements in one view.

2. **Load the full outline.** Use `get_outline` to understand the manuscript structure and scene order.

3. **List all story objects.** Use `list_story_objects` with each type filter (CHARACTER, LOCATION, WORLD_ELEMENT, PLOTLINE) to build a reference database.

4. **Load detailed story objects.** For each key character and location, use `get_story_object` to get full descriptions and notes.

5. **Read scenes sequentially.** Working through the outline in order, use `read_scene_content` for each scene. While reading, track:

   ### 5a. Character Consistency
   - Physical descriptions (hair color, height, scars, distinguishing features)
   - Personality traits and behavioral patterns
   - Knowledge — does a character reference something they shouldn't know yet?
   - Abilities — do character skills stay consistent?
   - Names and titles — are they spelled and used consistently?

   ### 5b. Timeline Consistency
   - Do events happen in a logical order?
   - Are time references consistent? (e.g., "three days later" followed by "yesterday" — does the math work?)
   - Are character ages consistent with the timeline?
   - Are seasonal/weather references consistent with the stated time period?

   ### 5c. Setting Consistency
   - Are location descriptions consistent between scenes? (e.g., a tavern described as "dimly lit" in one scene and "sun-drenched" in another — is this explained by time of day?)
   - Are distances and travel times plausible?
   - Are geographical relationships consistent? (North of the river in one scene, south in another?)

   ### 5d. World-Building Consistency
   - Do magic systems / technology / rules of the world stay consistent?
   - Are cultural practices described consistently?
   - Do organizations and power structures remain coherent?

   ### 5e. Plot Consistency
   - Are plot threads picked up and resolved?
   - Are character motivations consistent with their actions?
   - Are cause-and-effect chains logical?

6. **Compile findings** into a structured consistency report.

## Output Format

```markdown
# Consistency Report: [Project Title]

## Summary
[Overview of consistency status — How many issues found, severity breakdown]

## Critical Issues (Must Fix)
[Contradictions that would confuse or frustrate readers]

### Issue 1: [Brief title]
- **Type:** [Character / Timeline / Setting / World-Building / Plot]
- **Location:** [Scene A title] vs [Scene B title]
- **Details:** [Exact contradiction with quotes]
- **Suggested Resolution:** [How to fix]

## Minor Issues (Should Fix)
[Inconsistencies that attentive readers might notice]

### Issue N: [Brief title]
- **Type:** [type]
- **Location:** [where]
- **Details:** [what]
- **Suggested Resolution:** [how]

## Ambiguous Items (Review)
[Things that might or might not be issues — author should decide]

### Item N: [Brief title]
- **Observation:** [what was noticed]
- **Question for Author:** [what to clarify]

## Unresolved Plot Threads
[Plot elements introduced but not yet resolved — may or may not be intentional]

## Consistency Strengths
[What the manuscript does well in maintaining consistency]
```

## Tips

- Keep a running "fact sheet" as you read through scenes to track details.
- Some apparent inconsistencies are intentional (unreliable narrator, character lying). Note these as "ambiguous" rather than flagging as errors.
- Focus on reader-facing issues. Internal notes and outlines don't need the same consistency rigor.
- Prioritize by severity: a character changing eye color mid-book is more critical than a minor timeline ambiguity.
- Present findings with care — consistency issues can feel like accusations. Frame them as "here's what I noticed" with clear evidence, not "you got this wrong."
