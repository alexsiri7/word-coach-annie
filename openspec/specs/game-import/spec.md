# game-import

## Purpose

A game that already exists, such as Tune Story in the engine's repository today, has to come into Annie so it can be edited there and exported again. Import reads a bundle back into a game project, with the same shape as export.

## Requirements

### Requirement: Importing a bundle
Annie SHALL read a bundle, whether Annie exported it or it is an engine repository's current content, into a game project: rooms, hotspots, items, characters, objects, stats, acts, worlds, the model registry and the character sheets. A character sheet with a goal SHALL become an improv node.

#### Scenario: Importing content
- WHEN the author imports a bundle into an empty game project
- THEN its rooms, hotspots, items, characters, objects, stats, acts and worlds appear in the project

#### Scenario: A character sheet
- WHEN the bundle has an AI sheet for a character with a goal
- THEN the character gets an improv node with that persona, knowledge and goal

### Requirement: Round trip
Importing a bundle that Annie exported and exporting the game again SHALL give the same bundle.

#### Scenario: Export, import, export
- WHEN a bundle is imported into an empty project and exported again
- THEN the new bundle is identical to the first

### Requirement: Report what could not be read
Import SHALL list anything it could not map, with the file and the field, and leave it out rather than guess.

#### Scenario: An unknown field
- WHEN a content file has a field the importer does not know
- THEN the report names the file and the field, and the rest is imported

### Requirement: No silent overwrite
Importing into a project that already has objects with the same ids MUST show what would change and need the author's confirmation. Nothing is overwritten without it.

#### Scenario: Importing over existing objects
- WHEN a bundle has a room whose id is already in the project
- THEN Annie shows the difference and waits for the author to confirm

### Requirement: Migrating an existing game
The author SHALL be able to import a game's current content as its first version in Annie, then export it, and the exported bundle SHALL play the same as the original content.

#### Scenario: Migrating Tune Story
- WHEN the author imports Tune Story's current content and exports it again
- THEN the engine plays the same main-path route with the same state and events as with the original content
