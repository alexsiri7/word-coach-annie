# game-export

## Purpose

The engine plays a bundle, not an Annie project. Export turns a game in Annie into a versioned bundle that the engine loads, the same way every time, so the game in Annie and the game the player plays cannot drift apart.

## Requirements

### Requirement: The bundle
Annie SHALL export a game as one bundle: a manifest that names the game, its schema version and its start; the content files for worlds, rooms, items, characters, objects, stats and acts; the model registry and the model files; and the AI sheet of each character that has an improvised conversation. The files SHALL be laid out as the engine loads them.

#### Scenario: Exporting a game
- WHEN the author exports a game that passes the linter
- THEN the bundle holds the manifest, the content files, the registry, the model files and the character sheets

### Requirement: Deterministic output
Exporting the same game twice SHALL give byte-identical bundles: stable ordering, no timestamps and no random ids, so that a bundle kept in git shows only real changes.

#### Scenario: Exporting twice
- WHEN a game is exported twice with no edits in between
- THEN the two bundles are identical

### Requirement: Lint gate
Annie MUST refuse to export a game that has linter errors, and list them.

#### Scenario: Exporting a broken game
- WHEN the author exports a game with an unreachable ending
- THEN no bundle is made and the linter's errors are shown

### Requirement: Engine compatibility
The manifest SHALL name the schema version the bundle follows. A game that uses something the schema version cannot express MUST NOT export, and Annie SHALL say what it is. Until the schema version allows it, an improv node with more than one outcome is such a case.

#### Scenario: Several outcomes in an improv node
- WHEN a game has an improv node with two outcomes and the schema version supports one
- THEN the export is refused, naming the node and the limit

### Requirement: Getting the bundle
The author SHALL be able to download the bundle from the app, and an agent SHALL be able to export through Annie's MCP tools, which return the same bundle.

#### Scenario: An agent exports a game
- WHEN an agent exports a game through the MCP tools
- THEN it receives the same bundle the app would download
