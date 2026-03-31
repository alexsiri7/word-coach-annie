---
name: line-edit
description: Perform a line edit on a scene — sentence-level improvements for clarity, voice, word choice, and rhythm
required_tools:
  - read_scene_content
  - get_story_object
  - list_relationships
triggers:
  - "line edit"
  - "sentence-level edit"
  - "polish prose"
  - "improve writing"
---

# Line Edit

## When to Use

Use this skill when the author wants **sentence-level feedback** on prose quality. A line edit improves clarity, voice, word choice, and rhythm without changing the story's structure or content.

## Prerequisites

- A scene with written content (ideally past the first draft stage).
- The `nodeId` of the scene to edit.

## Steps

1. **Read the scene content.** Use `read_scene_content` to load the full text of the target scene.

2. **Identify linked characters.** Use `list_relationships` to find characters in this scene, then `get_story_object` for each to understand their voice and personality.

3. **Read the scene carefully, analyzing for:**

   ### 3a. Clarity
   - Are sentences easy to understand on first read?
   - Are there ambiguous pronouns (who is "he" referring to?)?
   - Are there run-on sentences or overly complex constructions?

   ### 3b. Word Choice
   - Are words precise and specific? (e.g., "walked" vs "shuffled", "strode", "crept")
   - Is there over-reliance on adverbs where a stronger verb would work?
   - Are there clichés that could be replaced with fresher language?
   - Is the vocabulary appropriate for the genre and tone?

   ### 3c. Rhythm & Flow
   - Is there variety in sentence length? (Short sentences for impact, longer for description)
   - Do paragraphs flow naturally from one to the next?
   - Is there awkward repetition of words or sentence structures?

   ### 3d. Voice Consistency
   - Does the narrative voice stay consistent throughout?
   - Is dialogue natural and distinct for each character?
   - Does the tone match the scene's emotional content?

   ### 3e. Show vs Tell
   - Are emotions shown through action and dialogue rather than stated?
   - Are there passages that explain what should be demonstrated?

   ### 3f. Dialogue
   - Does each character sound distinct?
   - Are dialogue tags varied but not distracting? ("said" is fine; avoid "exclaimed, opined, declared" unless intentional)
   - Is there a good balance of dialogue and action beats?

4. **Compile feedback** as a structured report with specific before/after suggestions.

## Output Format

```markdown
# Line Edit: [Scene Title]

## Overall Impression
[Brief assessment of the prose quality and main patterns to address]

## Recurring Patterns
[List any patterns that appear multiple times — e.g., "sentences frequently start with 'He'", "passive voice overuse"]

## Specific Suggestions

### Line [approximate location]
**Original:** "[exact or near-exact quote]"
**Suggestion:** "[improved version]"
**Reason:** [why this change improves the prose]

### Line [approximate location]
**Original:** "[quote]"
**Suggestion:** "[improved version]"
**Reason:** [why]

[...repeat for significant suggestions]

## Dialogue Notes
[Observations specific to dialogue quality]

## Strengths
[2–3 things the prose does particularly well — important for author morale]
```

## Tips

- The writer's voice is sacred. Enhance it, never replace it. Your suggestions should help them sound more like themselves at their best.
- Focus on the most impactful changes. Don't flag every minor issue — that's exhausting, not helpful.
- A line edit assumes the structure is solid. If you spot structural issues, note them briefly but don't dwell — suggest a developmental edit instead.
- Consider the genre. Literary fiction tolerates longer, more complex prose. Thrillers want tight, punchy sentences.
- When a line is genuinely good, say so — and name why. "This lands because the short sentence after the long one creates a gut-punch rhythm." Specific praise teaches.
