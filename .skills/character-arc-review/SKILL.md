---
name: character-arc-review
description: Map character arcs across scenes, identify flat arcs, and analyze character development
required_tools:
  - get_outline
  - read_scene_content
  - list_story_objects
  - get_story_object
  - list_relationships
triggers:
  - "character arc"
  - "character development"
  - "character review"
  - "flat arc"
  - "character analysis"
---

# Character Arc Review

## When to Use

Use this skill when the author wants to analyze how a character (or all major characters) develop across the manuscript. This maps character appearances, tracks emotional/psychological changes, and identifies gaps or inconsistencies in character arcs.

## Prerequisites

- A project with scenes containing character appearances.
- Characters defined as story objects (ideally with descriptions and notes).
- Relationships linking characters to scenes for best results.

## Steps

1. **Load characters.** Use `list_story_objects` filtered by type CHARACTER to get all characters. Then use `get_story_object` for each major character to load full details.

2. **Load the outline.** Use `get_outline` to understand manuscript structure and scene order.

3. **Map character appearances.** Use `list_relationships` to find which scenes each character appears in. Build a scene-by-scene map of character involvement.

4. **Read relevant scenes.** For the target character(s), use `read_scene_content` to read each scene they appear in, in order.

5. **Track arc progression for each character:**

   ### 5a. Starting State
   - Who is this character at the beginning?
   - What is their core belief, desire, or flaw?
   - What is their external goal?
   - What is their internal need (often different from their stated goal)?

   ### 5b. Scene-by-Scene Progression
   For each scene the character appears in, note:
   - What is the character's emotional state entering the scene?
   - What challenge or new information do they face?
   - How do they respond? (This reveals character.)
   - What changes (internally or externally) by the end of the scene?
   - Does their response evolve compared to earlier scenes?

   ### 5c. Key Turning Points
   - Where does the character's belief/worldview first get challenged?
   - Where do they make a choice that reveals growth (or resistance)?
   - Is there a "dark night of the soul" / lowest point?
   - Is there a moment of transformation or acceptance?

   ### 5d. Ending State
   - How has the character changed from scene 1 to the final scene?
   - Is the resolution of their arc satisfying and earned?
   - Does it connect to the story's theme?

6. **Analyze arc type:**
   - **Positive arc:** Character overcomes a flaw or false belief → grows
   - **Negative arc:** Character descends, corrupted by their flaw → falls
   - **Flat arc:** Character doesn't change but changes the world around them
   - **No arc:** Character is the same at the end — may indicate a problem or may be intentional for minor characters

7. **Identify issues:**
   - Character disappears for long stretches without explanation
   - Character changes feel sudden/unearned (needs more intermediate steps)
   - Character's internal journey doesn't connect to the external plot
   - Character is purely reactive (things happen TO them) rather than active (they drive the plot)

8. **Compile analysis** into the structured output format.

## Output Format

```markdown
# Character Arc Review: [Project Title]

## Characters Analyzed
| Character | Role | Arc Type | Rating |
|-----------|------|----------|--------|
| [Name] | [protagonist/antagonist/supporting] | [Positive/Negative/Flat/None] | [Strong/Adequate/Needs Work] |

---

## [Character Name]

### Starting State (Scene: [first appearance])
- **Core Belief:** [what they believe about the world/themselves]
- **External Goal:** [what they want]
- **Internal Need:** [what they actually need]
- **Flaw/Wound:** [what holds them back]

### Arc Progression
| Scene | Emotional State | Challenge | Response | Change |
|-------|----------------|-----------|----------|--------|
| [title] | [state] | [what they face] | [how they respond] | [what shifts] |

### Key Turning Points
1. **Belief Challenged:** [scene] — [description]
2. **Critical Choice:** [scene] — [description]
3. **Lowest Point:** [scene] — [description]
4. **Transformation:** [scene] — [description]

### Ending State (Scene: [last appearance])
- **New Belief:** [how their worldview changed]
- **Resolution:** [was the arc satisfying?]
- **Connection to Theme:** [how the arc serves the story's theme]

### Issues & Recommendations
- [Specific issues with this character's arc]
- [Recommendations for improvement]

---

[Repeat for each character]

## Cross-Character Dynamics
[How character arcs interact — do they complement, mirror, or contrast each other?]

## Overall Recommendations
1. [Most impactful suggestion for character development]
2. [Second suggestion]
3. [Third suggestion]
```

## Tips

- Not every character needs a dramatic arc. Supporting characters can serve the story perfectly well with minimal change.
- The protagonist's arc should connect to the story's theme. If the theme is "the cost of ambition," the protagonist's arc should grapple with ambition.
- Character arcs should be *caused* by story events, not just correlated with them. Growth should feel earned.
- Consider the relationship between internal and external arcs — the best stories interweave them so the external resolution requires internal growth.
