# AI Assistance

## Purpose

Annie's in-app AI is a coach and reader, not a ghostwriter. It knows the story, answers questions about it, reviews it from several reader perspectives and offers suggestions — but the prose changes only when the author applies something.

## Requirements

### Requirement: Story-aware chat

Each project SHALL have an AI chat panel that streams responses with the story's context — characters, outline and current scene — supplied automatically. Chats SHALL be kept as named conversations per project that the author can create, reopen and delete. Long conversations SHALL be compressed to stay within the model's limits rather than fail, and a reader closing the panel mid-response SHALL not break the conversation.

#### Scenario: Context without pasting
- GIVEN a project with a character Mara and the author viewing scene 3
- WHEN the author asks "What does Mara want here?"
- THEN the answer streams in and draws on Mara's profile and scene 3

#### Scenario: Long conversation
- GIVEN a conversation longer than the model's context
- WHEN the author sends another message
- THEN a response is returned rather than an error

### Requirement: Suggestions are never applied silently

Inline AI actions on a selection (such as brainstorm, expand or summarise) and manuscript-level analyses SHALL return their results in a side panel. Scene content SHALL change only when the author explicitly applies a result.

#### Scenario: Discard a suggestion
- GIVEN the author runs expand on a paragraph
- WHEN they discard the suggestion
- THEN the paragraph is unchanged

### Requirement: Peer review from five perspectives

The author or an agent SHALL be able to run a peer review of a project in which five reviewer personas read it in parallel — an acquisitions editor, a fan reader, a peer author, an acting coach reading for emotional truth and earned feeling, and a comedy writer reading for whether jokes work — plus a consensus. Each run SHALL be stored and past reviews SHALL be viewable newest first. Starting a run while one is in progress SHALL return the pending run rather than start another. Every persona's lens SHALL be defined once and used identically by the web UI, the chat and agents.

#### Scenario: Five reviews and a consensus
- GIVEN a drafted project
- WHEN the author runs a peer review
- THEN the stored result holds one review from each of the five personas and a consensus

#### Scenario: Run already in progress
- GIVEN a peer review is running for a project
- WHEN another run is requested
- THEN the in-progress run is returned

### Requirement: Author-controlled model settings

The author SHALL be able to choose the AI model and supply their own provider API key in settings. Stored keys SHALL be encrypted and only ever shown back masked. When no key is configured, AI features SHALL say so instead of failing.

#### Scenario: Key never echoed
- GIVEN the author saved an API key
- WHEN they reopen settings
- THEN only a masked form of the key is shown
