# Agent Collaboration

## Purpose

Annie exposes the whole writing workspace to AI agents through an MCP server, so an assistant like Claude can read, organise and coach on a manuscript from any client. The protocol itself encodes Annie's philosophy: the agent is a structural collaborator, the prose belongs to the author, and nothing an agent does is unrecoverable.

## Requirements

### Requirement: Agents have parity with the web UI

The MCP server SHALL be reachable locally over stdio and remotely over HTTP, and SHALL offer tools covering projects, structure, scene content, annotations, story objects, relationships, universes and world objects, writing tasks, submissions, opportunities, export, Google Docs connection, coaching context and snapshots. A change made through a tool SHALL persist exactly as the same change made in the web UI, and every project-scoped tool SHALL enforce the same access rules.

#### Scenario: Same result either way
- GIVEN an agent creates a character through the MCP server
- WHEN the author opens the project in the web UI
- THEN the character is there as if created in the UI

### Requirement: Agents are told how to collaborate

The server SHALL offer initial instructions that establish the agent as a structural collaborator: beats, annotations and editorial flags by default, prose only when the author explicitly asks, stale-write protection always. These guidelines SHALL live in Annie so every integration receives them without its own prompt. The server SHALL NOT hard-block an agent from writing prose; when the author asks for prose, the agent may write it.

#### Scenario: Instructions on connect
- GIVEN a new agent session
- WHEN the agent requests initial instructions
- THEN it receives the collaboration guidelines

#### Scenario: Author asks for prose
- GIVEN the author explicitly asks the agent to draft a paragraph
- WHEN the agent writes prose content to the scene
- THEN the write is accepted

### Requirement: Beats can be inserted without resubmitting prose

An agent SHALL be able to insert a single beat after a given paragraph, addressed by paragraph index across the whole scene, without sending any prose. When the index falls inside a block of prose, the system SHALL split the block at that paragraph boundary and insert the beat, leaving every word of prose byte-identical.

#### Scenario: Beat mid-block
- GIVEN a scene written as one block of five paragraphs
- WHEN an agent inserts a beat after paragraph 2
- THEN the scene reads paragraphs 1–2, the beat, paragraphs 3–5
- AND the prose text is identical to before

### Requirement: Paragraph edits are targeted and declare intent

An agent SHALL be able to replace a single paragraph or beat by index, supplying the fingerprint of that paragraph so a stale edit is refused. It MAY declare the edit editorial — correcting or rearranging the author's words rather than replacing them — as a signal that the system records but does not enforce.

#### Scenario: Stale paragraph
- GIVEN an agent read paragraph 4 and the author then changed it
- WHEN the agent updates paragraph 4 with the old fingerprint
- THEN the update is refused

### Requirement: Destructive tools are gated

Destructive tools — deletes and restores — SHALL be refused unless destructive operations are explicitly enabled for the server; with no configuration they SHALL be refused. Non-destructive tools SHALL work either way.

#### Scenario: Default server
- GIVEN a server started with no destructive setting
- WHEN an agent calls a delete tool
- THEN the call is refused
- AND read and create tools still work

### Requirement: Agent work is recoverable by snapshot

Agents SHALL be able to snapshot the database, list snapshots and restore one, and write operations SHALL take automatic snapshots so any agent session can be rolled back. Snapshot inputs SHALL be validated so they cannot inject commands.

#### Scenario: Roll back an agent session
- GIVEN a snapshot taken before an agent reorganised the outline
- WHEN the author restores that snapshot
- THEN the outline is as it was before

### Requirement: Coaching context and writing skills

The server SHALL offer read-only coaching context for an agent — the author's voice, a scene's focus, plot-thread status, story-bible cross-references and consistency context — and SHALL publish curated writing skills (such as developmental edit, line edit, consistency check, plot structure analysis, character arc review, outline review and scene drafting) as MCP prompts, with their metadata listable. Review-style prompts SHALL carry Annie's coaching persona and choose the skill appropriate to the scene's status.

#### Scenario: Plan beats for a scene
- GIVEN a Draft scene in chapter 4
- WHEN an agent requests the beat-planning prompt for it
- THEN the prompt includes the scene's status, chapter and word count

### Requirement: Remote clients authorise with OAuth

For remote MCP clients the system SHALL act as an OAuth 2.0 authorisation server: publishing authorisation-server metadata, supporting dynamic client registration, the authorise flow with user consent, and the token endpoint. Tokens issued this way SHALL authenticate MCP requests; requests without a valid token SHALL be refused.

#### Scenario: New client connects
- GIVEN an MCP client that has never connected
- WHEN it registers, the user approves, and it exchanges the code
- THEN its token is accepted by the MCP endpoint
