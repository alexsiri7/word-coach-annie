---
name: consistency-check
description: Cross-reference world elements, characters, and settings for contradictions across the manuscript — including story bible cross-referencing
required_tools:
  - get_outline
  - read_scene_content
  - list_story_objects
  - get_story_object
  - list_relationships
  - export_story_bible
  - cross_reference_story_bible
  - update_story_object
  - add_annotation
triggers:
  - "consistency check"
  - "continuity check"
  - "find contradictions"
  - "world consistency"
  - "story bible check"
  - "canon check"
---

# Consistency Check

## When to Use

Use this skill when the author wants to verify that their manuscript is internally consistent — no contradictions in character details, timeline, setting descriptions, or world-building rules. This includes cross-referencing the actual prose against story object definitions to catch drift between what the story bible says and what the manuscript says.

## Prerequisites

- A project with multiple scenes and story objects defined.
- Works best when characters, locations, and world elements have descriptions and relationships set up.

## Steps

### Phase 1: Gather Reference Data

1. **Export the story bible.** Use `export_story_bible` to get a complete reference of all characters, locations, plotlines, and world elements in one view.

2. **Load the full outline.** Use `get_outline` to understand the manuscript structure and scene order.

3. **List all story objects.** Use `list_story_objects` with each type filter (CHARACTER, LOCATION, WORLD_ELEMENT, PLOTLINE) to build a reference database.

4. **Load detailed story objects.** For each key character and location, use `get_story_object` to get full descriptions and notes.

### Phase 2: Cross-Reference Prose Against Story Bible

5. **Run story bible cross-reference.** Use `cross_reference_story_bible` to load all story objects alongside scene content with relationship mappings. This provides structured data optimized for finding mismatches between the story bible and the actual prose.

6. **Identify mismatches.** For each story object, compare its defined attributes against how it appears in the prose. Track:

   - **Character attributes**: Does the prose describe a character differently than the story object? (hair color, eye color, age, height, scars, distinguishing features)
   - **Character behaviour**: Does a character act inconsistently with their defined personality, knowledge, or abilities?
   - **Location details**: Are location descriptions in the prose consistent with the story object definition?
   - **Timeline events**: Do events in the prose match timeline entries on world objects?
   - **World-building rules**: Does the prose follow the rules established in world element definitions?

### Phase 3: Scene-by-Scene Consistency

7. **Read scenes sequentially.** Working through the outline in order, use `read_scene_content` for each scene. While reading, track:

   #### 7a. Character Consistency
   - Physical descriptions (hair color, height, scars, distinguishing features)
   - Personality traits and behavioral patterns
   - Knowledge — does a character reference something they shouldn't know yet?
   - Abilities — do character skills stay consistent?
   - Names and titles — are they spelled and used consistently?

   #### 7b. Timeline Consistency
   - Do events happen in a logical order?
   - Are time references consistent? (e.g., "three days later" followed by "yesterday" — does the math work?)
   - Are character ages consistent with the timeline?
   - Are seasonal/weather references consistent with the stated time period?

   #### 7c. Setting Consistency
   - Are location descriptions consistent between scenes? (e.g., a tavern described as "dimly lit" in one scene and "sun-drenched" in another — is this explained by time of day?)
   - Are distances and travel times plausible?
   - Are geographical relationships consistent? (North of the river in one scene, south in another?)

   #### 7d. World-Building Consistency
   - Do magic systems / technology / rules of the world stay consistent?
   - Are cultural practices described consistently?
   - Do organizations and power structures remain coherent?

   #### 7e. Plot Consistency
   - Are plot threads picked up and resolved?
   - Are character motivations consistent with their actions?
   - Are cause-and-effect chains logical?

### Phase 4: Compile and Present Findings

8. **Compile findings** into a structured consistency report (see Output Format below).

### Phase 5: Story Object Sync

9. **For each mismatch** between the story bible and the prose, determine the best resolution and apply it immediately:

    - **Option A: Update the story bible** — When the prose is specific and detailed and the story object is vague or missing the detail.
      → Use `update_story_object` to sync the story bible entry with what the prose says.

    - **Option B: Flag the scene for revision** — When the story object definition is explicit and the prose contradicts it.
      → Use `add_annotation` on the scene to mark the specific passage for revision, noting what the correct value should be.

    - **Option C: Keep both versions** — When the difference could be intentional (unreliable narrator, character growth, regional dialect).
      → Document in the report as an ambiguous item.

    **When in doubt between A and B, prefer B (add annotation).** Annotations are non-destructive; the author can review and dismiss. Changing the story bible is harder to reverse.

## Output Format

```markdown
# Consistency Report: [Project Title]

## Summary
[Overview of consistency status — How many issues found, severity breakdown]

## Story Bible vs Prose Mismatches
[Discrepancies between story object definitions and the actual manuscript text]

### Mismatch 1: [Object Name] — [Brief title]
- **Object:** [Name] ([Type], ID: [id])
- **Story Bible says:** [value from story object]
- **Prose says:** [value from scene text]
- **Scene:** [Scene title] (ID: [id])
- **Severity:** CRITICAL / MAJOR / MINOR
- **Resolution options:**
  - A) Update story object to match prose
  - B) Flag scene for revision (story bible is correct)
  - C) Keep both (intentional difference)

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
- When updating story objects, add a note explaining what was changed and why — e.g., "Updated eye color to match Ch. 3 prose description".
