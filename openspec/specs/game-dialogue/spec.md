# game-dialogue

## Purpose

Conversations are authored as graphs. Fixed lines and choices are written out; improvised conversations hand the character to an AI with a persona, what it knows and a goal. Annie holds the graph and gives the author a visual editor for it, and the engine runs it. The AI never changes game state itself: it can only reach an outcome the author declared.

## Requirements

### Requirement: Dialogue graphs
A conversation SHALL belong to a character and be a graph of nodes with an entry node. A node is a line (a speaker says something), a choice (the player picks one option, each with optional conditions), an action (effects to apply, or a branch on a condition) or an improv node. Every node SHALL name the node that follows it, or end the conversation.

#### Scenario: A scripted exchange
- WHEN the author writes a line, a choice with two options and a line after each
- THEN the conversation plays those lines in that order for the option the player picks

#### Scenario: A choice with a condition
- WHEN an option has a condition that does not hold
- THEN the player is not offered that option

### Requirement: Improv nodes
An improv node SHALL hold the character's persona, what the character knows and must not reveal, any lines the character must say (optionally only unless the player carries an item), the player's goal, an escalation ladder that shapes the three suggested replies, one or more outcomes (each with when it applies, its effects and the node that follows), a canned line for when the AI cannot be reached, and a limit on turns.

#### Scenario: Defining an improv goal
- WHEN the author gives a bartender an improv node with the goal 'convince her I am staying' and one outcome that sets a flag
- THEN the conversation is improvised in character, and reaching the goal applies that outcome's effects

#### Scenario: A conversation that cannot get stuck
- WHEN the turn limit is reached or the AI cannot be reached
- THEN the conversation takes its fallback outcome and the player keeps playing

### Requirement: Visual editor
Annie SHALL show a conversation as a graph that the author edits by adding, moving, connecting and deleting nodes and by editing their text and fields. The author SHALL be able to play a path through the conversation in a preview without the AI, choosing the outcome of each improv node by hand.

#### Scenario: Editing a conversation
- WHEN the author adds a line node and connects it after another node
- THEN the graph shows the new node and the connection, and the change is saved

#### Scenario: Previewing a path
- WHEN the author plays a conversation in the preview and reaches an improv node
- THEN the preview offers its outcomes to pick, and carries on from the one picked

### Requirement: Checked as it is edited
The editor SHALL report a node that nothing leads to, a node that leads to a node that does not exist, and an improv node without a fallback outcome.

#### Scenario: A node that leads nowhere
- WHEN a node names a next node that has been deleted
- THEN the editor marks the node and says what is missing

### Requirement: Characters' lines
A line SHALL be said by a character or by the player. Text MAY contain the token {protagonist}, which stands for the protagonist's name.

#### Scenario: The protagonist's name
- WHEN a line contains {protagonist}
- THEN the editor preview shows the protagonist's name in its place

### Requirement: Agent access
Conversations SHALL be readable and writable through Annie's MCP tools, with the same validation as in the app.

#### Scenario: An agent writes a conversation
- WHEN an agent adds nodes to a conversation through the MCP tools
- THEN they appear in the visual editor, and invalid nodes are refused with the same message the app gives
