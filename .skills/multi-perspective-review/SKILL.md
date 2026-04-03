---
name: multi-perspective-review
description: Send the full manuscript to three AI reviewers (Publisher, Reader, Writer) in parallel and return structured feedback plus a consensus synthesis
required_tools:
  - get_outline
  - read_scene_content
triggers:
  - "peer review"
  - "multi-perspective review"
  - "get peer review"
  - "publisher review"
  - "reader review"
  - "writer review"
  - "three reviewers"
  - "multiple perspectives"
---

# Multi-Perspective Review

## When to Use

Use this skill when the author wants structured feedback from multiple viewpoints simultaneously. This is most valuable after a full draft is complete, or when the author wants to identify structural weaknesses before revision.

## What It Does

Sends the full manuscript to three independent AI reviewers, each with a distinct persona:

1. **Publisher** — Commercial and literary assessment. Would they publish this? What works, what doesn't, what would they ask the author to revise?
2. **Avid Reader** — Honest reader reaction. Was it engaging? What stayed with them? What felt weak?
3. **Experienced Writer** — Craft feedback: voice, pacing, character work, world-building integration, ending.

After receiving all three reviews, a synthesis step identifies consensus (where all three agree) and divergence (where perspectives differ).

## How to Use

### Via UI (Recommended)

Click the **Layers icon** (⊞) in the project toolbar to open the Peer Review dialog. Click "Run peer review." Results appear in four tabs: Publisher, Reader, Writer, and Consensus.

### Via Skill Invocation

When the author asks for a peer review or mentions wanting multiple perspectives, trigger this skill. The skill uses the built-in API endpoint (`POST /api/projects/:id/peer-review`) to run the review.

## Output Format

```
Publisher tab:   ~400 words — commercial/literary assessment
Reader tab:      ~400 words — reader experience and engagement
Writer tab:      ~400 words — craft-level feedback on technique
Consensus tab:   ~300 words — what all three agreed on, key disagreements, top priority
```

## What to Look For in Results

The consensus tab is the most actionable — when all three reviewers independently flag the same issue, that issue needs addressing regardless of genre or personal taste.

Common patterns:
- **Structural issues** often appear in both the Publisher (pacing) and Writer (scene structure) reviews
- **Emotional resonance** issues appear in both Reader (engagement) and Publisher (marketability) reviews  
- **Craft issues** the Reader notices but can't name are usually diagnosed correctly by the Writer

## Tips

- Run this after completing a full draft, not mid-chapter
- The longer and more complete the manuscript, the more useful the feedback
- Re-run after major revisions to check if flagged issues have been addressed
- If reviews diverge significantly, it usually signals the manuscript is doing something unconventional — which may be intentional
