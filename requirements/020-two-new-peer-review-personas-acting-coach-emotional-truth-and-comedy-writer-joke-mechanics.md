---
created: '2026-05-29'
github_issue: null
id: '020'
status: draft
title: 'Two new peer review personas: acting coach (emotional truth) and comedy writer
  (joke mechanics)'
updated: '2026-05-29'
---

## Why

The three existing reviewer personas — acquisitions editor, fan reader, peer author — all evaluate the manuscript at a structural or narrative level. None asks the specific vertical question: does this emotional moment actually land, and is it earned? The fan reader covers general enjoyment but not whether tears or laughter are mechanically justified. An acting coach applies the "do I believe this?" test to every emotional beat. A comedy writer can tell the difference between a joke that's funny and a joke that's supposed to be funny. Together they close the gap between "the plot works" and "the feelings work."

## What

Two new reviewer personas are added to REVIEW_PERSONAS in lib/review-personas.ts, exposed as MCP prompts, and available as conversation types in the web UI alongside the existing three.

**review-actor** — "Acting Coach"
An acting coach reading for emotional truth and earned feeling. Their questions: Is this emotion justified by the setup that preceded it, or is it declared by the prose and expected to land on credit? Is the character's internal state legible — do readers know what the character is feeling and why? Are subtext and text working together or fighting each other? Do emotional peaks arrive at the right moment, with enough runway? Are there places where the writing tells us to feel something rather than creating the conditions to feel it? Humor gets the same treatment: is a funny moment funny because of who this character is, or because the author needed a laugh there?

Tone: A drama teacher who has seen every shortcut and won't let you take them. "The reader doesn't know what she's feeling here — you do, but you haven't put it on the page." "This is a big emotional beat, but we haven't spent enough time with what it costs her."

**review-comedy** — "Comedy Writer"
A TV comedy writer reading specifically for whether jokes work. They apply craft-level scrutiny to every comic moment: Is the setup tight — does it plant exactly what the punchline needs without telegraphing it? Is the punchline surprising but, in retrospect, inevitable? Is the joke rooted in this specific character in this specific situation, or could it have been dropped in anywhere? Is there enough white space around the joke for it to land, or does the prose keep talking past it? Are there jokes that are *written* funny (amusing on the page) but would fall flat read aloud? Does the comic relief interrupt genuine dramatic tension or genuinely release it?

Tone: A writers' room peer, not a critic. "The setup's good but the punchline arrives one beat too late." "This is a situation comedy — milk it." "The joke is fine but it's not *her* joke."

Both entries follow the existing `(title: string) => string` lens signature. Both are added to the web UI peer review panel alongside editor, fan, and author.

## Issues

_None yet._