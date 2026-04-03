---
name: scene-drafting-assistant
description: Plan a scene as structured beats given the outline, characters, setting, and story context — produces BEAT blocks, not prose
required_tools:
  - get_outline
  - read_scene_content
  - get_story_object
  - list_story_objects
  - list_relationships
  - write_scene_content
triggers:
  - "draft scene"
  - "write scene"
  - "scene drafting"
  - "help me write"
---

# Scene Drafting Assistant

## When to Use

Use this skill when the author wants help planning a scene. Annie maps the scene as a sequence of BEAT blocks — structural waypoints that tell the author what happens, what shifts, and what to aim for. The author writes the prose; Annie provides the blueprint.

## Prerequisites

- A project with an outline that includes the target scene.
- The scene should have a synopsis (even brief) describing what should happen.
- Characters, locations, and other story objects linked to the project help produce better results.

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
   - **Key Moments:** Any specific beats that must happen?

6. **Plan the scene as beats.** Break the scene into a sequence of BEAT blocks — structural waypoints that describe what happens, what shifts, and what the reader should feel. Annie does NOT write prose. Each beat should cover:

   ### 6a. Opening Beat(s)
   - Where and when are we? Whose POV? What's the emotional entry point?
   - What hook or tension pulls the reader in?

   ### 6b. Body Beats
   - What actions, dialogue exchanges, or revelations occur?
   - What does each beat accomplish for the scene's goal?
   - Where does tension rise, release, or shift?
   - What sensory/emotional texture should the author aim for?

   ### 6c. Closing Beat(s)
   - What changes, decision, or revelation ends the scene?
   - What question or tension carries the reader forward?

7. **Write the beats.** Use `write_scene_content` with the `blocks` parameter, using **BEAT blocks only** (never CONTENT blocks). Each beat is a structural waypoint, not prose:

   ```json
   {
     "blocks": [
       { "type": "BEAT", "content": "OPENING — Elena's kitchen, morning. She's rehearsing her resignation speech to the coffee maker. Tone: nervous energy masked as calm." },
       { "type": "BEAT", "content": "TURN — Phone rings. It's Marcus. He knows. Tension spikes — how did he find out?" },
       { "type": "BEAT", "content": "ESCALATION — Argument. Elena defends her choice; Marcus appeals to loyalty. Dialogue-heavy, rapid-fire. Reader should feel both sides." },
       { "type": "BEAT", "content": "CLOSING — Elena hangs up. Silence. She looks at the resignation letter. Decision hardens. End on: she folds the letter into her bag." }
     ]
   }
   ```

8. **Provide coaching notes** to the author:
   - Why you structured the beats this way
   - What each beat needs to land emotionally
   - Suggestions for voice, pacing, and sensory detail the author should bring
   - Any questions or decision points left open

## Output Format

```markdown
# Scene Beats: [Scene Title]

## Context Used
- **Previous Scene:** [title] — [brief summary of where we left off]
- **Characters Present:** [list]
- **Location:** [setting]
- **Scene Goal:** [what happens in this scene]

## Beats
[Saved directly to the scene via write_scene_content using BEAT blocks]

## Coaching Notes
- **POV:** [character and why]
- **Tone:** [what to aim for]
- **Beat Rationale:**
  - [Why the opening beat works this way]
  - [Why the turn lands here]
  - [Why the closing beat creates forward momentum]
- **For the Author:**
  - [What voice/style to bring to each beat]
  - [Where sensory detail matters most]
  - [Decision points left open]
  - [Facts/details that need verification]
```

## Tips

- Beats are a BLUEPRINT. The author writes the prose — Annie maps the structure.
- Each beat should be specific enough to draft from but loose enough for the author's voice.
- When in doubt about a detail, flag it: `[CHECK: character's eye color]`.
- Aim for 4-8 beats per scene. Too few = vague; too many = micromanaging.
- Reference the previous scene's emotional endpoint to ensure continuity.
