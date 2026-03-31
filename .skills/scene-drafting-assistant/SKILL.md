---
name: scene-drafting-assistant
description: Help plan a scene by drafting structural BEAT blocks (not prose)
required_tools:
  - get_outline
  - read_scene_content
  - get_story_object
  - list_story_objects
  - list_relationships
  - write_scene_content
triggers:
  - "draft scene"
  - "plan scene"
  - "scene beats"
  - "beat planning"
  - "plan beats"
  - "scene drafting"
  - "help me write"
---

# Scene Beat Planner

## Hard Rule

**Annie NEVER writes prose or CONTENT blocks.** This skill produces BEAT blocks
only. Beats are structural directions — short descriptions of what happens in
each moment. The writer turns beats into prose.

Good beat: `Marcus enters the tavern, scans for the informant`
Bad (prose): `Marcus pushed open the heavy oak door, his eyes sweeping the dimly lit tavern...`

## When to Use

Use this skill when the author wants help planning the structure of a scene.
Annie gathers context, proposes a sequence of beats, and the author reviews,
reorders, and refines them before writing the prose themselves.

## Prerequisites

- A project with an outline that includes the target scene.
- The scene should have a synopsis (even brief) describing what should happen.
- Characters, locations, and other story objects linked to the project help produce better beats.

## Steps

1. **Load the outline.** Use `get_outline` to understand the full manuscript structure. Identify the target scene and its position in the story:
   - What chapter/part does it belong to?
   - What scenes come before and after it?

2. **Read surrounding scenes.** Use `read_scene_content` on:
   - The scene immediately before (to establish continuity)
   - The scene immediately after (if it exists, to know where the story is heading)

3. **Load linked story elements.** Use `list_relationships` to find all characters, locations, plotlines, and world elements connected to this scene or its parent chapter. Use `get_story_object` for each to load full details.

4. **If no relationships exist**, use `list_story_objects` for the project to see what's available. Ask the author which characters/locations are in this scene.

5. **Gather scene parameters** (from synopsis or by asking the author):
   - **POV Character:** Whose perspective is this scene from?
   - **Scene Goal:** What does the POV character want in this scene?
   - **Conflict:** What opposes them?
   - **Outcome:** Does the scene end in success, failure, or complication?
   - **Tone:** What emotional tone should the scene carry?

6. **Draft the beat sequence.** Plan the scene as a series of BEAT blocks. Each beat is a short structural direction describing one discrete narrative moment:

   ### Beat Principles
   - **One action per beat** — each beat describes a single moment or turn
   - **Structural, not narrative** — describe what happens, not how it reads
   - **Character-driven** — name who does what, don't use passive voice
   - **Include emotional beats** — internal shifts matter (e.g., "Elena realizes he's lying")
   - **Mark turning points** — flag the moment where the scene pivots
   - **Typical scene: 5-15 beats** — enough structure without over-constraining

   ### Scene Structure via Beats
   - **Opening beats:** Ground the reader — who, where, when, what's the immediate situation
   - **Rising beats:** Build tension, introduce conflict, advance the goal
   - **Pivot beat:** The moment of change, revelation, or decision
   - **Closing beats:** Show the consequence, leave tension unresolved for non-final scenes

7. **Write the beats.** Use `write_scene_content` with the `blocks` parameter. Every block must have `type: "BEAT"`. **Never use `type: "CONTENT"`**. Never pass the `content` parameter with HTML prose.

   Example:
   ```json
   {
     "nodeId": "<scene-id>",
     "blocks": [
       { "type": "BEAT", "content": "Marcus arrives at the tavern, peers through the rain-streaked window" },
       { "type": "BEAT", "content": "He spots Lena at the back table, disguised but recognizable" },
       { "type": "BEAT", "content": "Marcus sits down — tense greeting, both aware they're being watched" },
       { "type": "BEAT", "content": "Lena slides the envelope across the table, warns him not to open it here" },
       { "type": "BEAT", "content": "A stranger at the bar stands and leaves — Marcus realizes they've been made" },
       { "type": "BEAT", "content": "Marcus pockets the envelope, they split up — he exits through the kitchen" }
     ]
   }
   ```

8. **Provide a planning note** to the author explaining:
   - Why you chose this beat sequence
   - Which beats are load-bearing (removing them breaks the scene logic)
   - Where the author has the most creative freedom
   - Any alternative structures you considered

## Output Format

```markdown
# Beat Plan: [Scene Title]

## Context
- **Previous Scene:** [title] — [where we left off]
- **Characters Present:** [list]
- **Location:** [setting]
- **Scene Goal:** [what this scene accomplishes]

## Beats
[Written to the scene via write_scene_content blocks parameter]

## Planning Notes
- **Structure:** [why this sequence works]
- **Pivot Point:** [which beat is the turning point and why]
- **Load-Bearing Beats:** [which beats can't be removed]
- **Creative Freedom:** [where the author should make it their own]
- **Alternatives Considered:** [other structures that could work]
```

## Tips

- This produces a BEAT PLAN, not a draft. Set expectations: the author writes the prose.
- If the scene already has CONTENT blocks (prose the author wrote), preserve them. Only add/modify BEAT blocks.
- Match the level of detail to the author's preference. Some want sparse beats, others want granular moment-by-moment planning.
- When in doubt about a story detail, flag it in the beat: `[CHECK: does Marcus know about the letter at this point?]`
- If the author asks you to "write the scene" or "draft prose," remind them that you plan beats and they write the prose. Offer to make the beats more detailed if they want more guidance.
