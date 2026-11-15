# game-linter

## Purpose

A game that does not hold together should be caught in Annie, not by a player. The linter checks a game's data and reports problems the author can fix, before the game is exported.

## Requirements

### Requirement: Schema and references
The linter SHALL report every object that breaks the game's schema, and every reference to a room, item, flag, stat, act, goal, world, character, object or model that does not exist. Each finding SHALL say where it is: the object and the field.

#### Scenario: A dangling exit
- WHEN an exit leads to a room that has been deleted
- THEN the linter reports an error naming the room and the exit's field

#### Scenario: A missing item
- WHEN a condition names an item that does not exist
- THEN the linter reports an error naming the interaction and the condition

### Requirement: Reachability
The linter SHALL report rooms the player can never reach, puzzles that can never be solved and endings that can never be reached, working from the starting state and following exits, interactions and unlock conditions.

#### Scenario: An unreachable room
- WHEN no exit and no effect leads to a room
- THEN the linter reports an error naming the room

#### Scenario: An ending that cannot be reached
- WHEN the conditions of an ending can never all hold
- THEN the linter reports an error naming the ending and the condition that cannot be met

### Requirement: Softlocks
The linter SHALL report states from which the game can no longer be finished, such as an item that is used up before its last use, or a flag that only an interaction the player has already spent can set.

#### Scenario: An item used up too early
- WHEN an item is taken by an interaction that can run before another interaction that needs it
- THEN the linter reports an error naming both interactions

### Requirement: Unused and incomplete
The linter SHALL warn about flags that are set but never read, items nothing uses, models still marked as placeholders, and improv nodes without a fallback outcome.

#### Scenario: A flag nothing reads
- WHEN a flag is set by an effect and no condition names it
- THEN the linter reports a warning naming the flag

### Requirement: Errors and warnings
Each finding SHALL be an error or a warning. Errors MUST block an export and warnings MUST NOT.

#### Scenario: Only warnings
- WHEN the linter finds warnings and no errors
- THEN the game can be exported, and the warnings are listed with it

### Requirement: Where it runs
The linter SHALL run in the app, where its findings link to the objects, and through Annie's MCP tools, returning the same findings.

#### Scenario: An agent lints a game
- WHEN an agent runs the linter through the MCP tools
- THEN it receives the same errors and warnings the app shows
