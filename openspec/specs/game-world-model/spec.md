# game-world-model

## Purpose

An author building an adventure game in Annie describes how the game works as data: what the player can carry, what is true about the world, which stats, acts and endings there are, and what each interaction does. The engine (Punland) plays that data, so everything here is limited to what the engine can run. The same data is what the linter checks and the export writes.

## Requirements

### Requirement: Game objects
Annie SHALL let the author create, edit and delete the objects a game is made of: items, flags, stats, acts with their goals, worlds and puzzles. They live in the story bible of a game project, next to its characters and locations.

#### Scenario: Adding an item
- WHEN the author adds an item with a name and the line said when it is used on something it does not fit
- THEN the item is listed in the project's game objects and can be named by rules and interactions

#### Scenario: Deleting an object that is in use
- WHEN the author deletes an item or flag that a rule or interaction names
- THEN Annie lists where it is used and does not delete it until the author confirms

### Requirement: Conditions and effects
Rules SHALL be written only from the engine's vocabulary. Conditions are has, pickedUp, gathered, flag (with an optional value), stat (at least), act, goal, visited, world and not. Effects are say (optionally by a character), goTo (optionally at a floor point), goBack, wait, pickUp, give, take, gather, set, talk, changeStat and reachGoal. Annie MUST refuse a condition or effect outside that vocabulary, and one that names an object that does not exist.

#### Scenario: Building a rule
- WHEN the author gives an interaction the condition 'has the map' and the effect 'say a line'
- THEN the rule is saved and shows in the interaction

#### Scenario: An unknown effect
- WHEN a rule names an effect the engine does not have
- THEN Annie refuses it and lists the effects it does accept

### Requirement: Interactions
Each interaction on a hotspot SHALL have a verb (look, use, talk, pickup or go), an item when the verb is use, optional conditions that must all hold, and an ordered list of effects.

#### Scenario: Using an item on a hotspot
- WHEN the author adds a use interaction naming an item, with the effects 'take the item' and 'set a flag'
- THEN, once exported, using that item on that hotspot runs those effects in order

#### Scenario: A condition gates an interaction
- WHEN a hotspot has several interactions with the same verb and the first one's condition does not hold
- THEN the first interaction whose conditions all hold is the one that runs

### Requirement: Puzzles
A puzzle SHALL have a name and three parts: requires (conditions that make it available), solved_when (the condition that marks it done) and grants (the effects when it is solved). A puzzle MUST NOT hold logic of its own: it only names and orders conditions, flags and effects the game already has. Puzzles depend on each other through the flags they grant.

#### Scenario: Defining a puzzle
- WHEN the author defines the puzzle 'get a working guitar' that requires the broken guitar and is solved when the flag guitar_fixed is set
- THEN the puzzle shows what it needs, what solves it and what it grants

#### Scenario: Seeing what depends on what
- WHEN a puzzle's requires names a flag that another puzzle grants
- THEN both puzzles show the dependency

### Requirement: Acts, goals and endings
An act SHALL list its goals and its next entries in order. Annie MUST require the last next entry of an act that is not final to have no condition, so an act always leads somewhere.

#### Scenario: Branching to an ending
- WHEN the author gives the last act one next entry per ending, each with conditions on flags or stats, and a final one with no condition
- THEN the act can always continue, and the endings are listed

#### Scenario: An act that can get stuck
- WHEN the last next entry of an act that is not final has a condition
- THEN Annie reports the problem

### Requirement: Worlds
A world SHALL have a start room and MAY be locked until all of its unlock conditions hold.

#### Scenario: A locked world
- WHEN the author locks a world and gives it an unlock condition
- THEN the world stays locked until the condition holds

### Requirement: Agent access
Everything above SHALL be readable and writable through Annie's MCP tools, with the same validation as in the app.

#### Scenario: An agent adds a flag
- WHEN an agent creates a flag through the MCP tools
- THEN it appears in the app's game objects, and an invalid one is refused with the same message the app gives
