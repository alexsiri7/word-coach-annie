# game-scenes-and-hotspots

## Purpose

Where a game happens: the rooms the player walks around, the things to look at and use, and the exits between rooms. In the engine a room is a 3D scene model seen through one fixed camera, so Annie holds the room's data and the registry that says which model each room, character and object uses, together with the art spec and status an artist works from. The model files themselves stay in the engine's repository: Annie names each one by its path and never holds the file.

## Requirements

### Requirement: Rooms
A room SHALL have a label, a place (a verb and a name), a hint, a world, a scene model from the registry, a start point and a walkable floor given as a convex polygon of floor points. It MAY have an onStart cutscene. A floor point is a position in the room's 1280 by 640 scene pixels, as seen through the room's camera. Annie MUST refuse a floor that is not convex and a start point outside the floor.

#### Scenario: Creating a room
- WHEN the author creates a room in a world with a scene model, a floor and a start point
- THEN the room is listed in that world and can be the target of exits

#### Scenario: A floor that is not convex
- WHEN the author saves a floor polygon that is not convex
- THEN Annie refuses it and says which corner breaks it

### Requirement: Hotspots
A hotspot SHALL have an id that is unique in its room, a name, a default verb, a target, a walk-to point on the floor, its interactions and, optionally, conditions for when it is present. The target is either a character or object placed at a floor point, or a named node of the scene model. A hotspot MUST NOT carry a screen shape: where it is drawn comes from its model.

#### Scenario: Placing a character
- WHEN the author adds a hotspot targeting a character at a floor point
- THEN the character stands there and the hotspot's interactions apply to them

#### Scenario: A part of the scene
- WHEN the author adds a hotspot targeting a node of the scene model, such as a door
- THEN the hotspot is the part of the scene with that node name

#### Scenario: A duplicate id
- WHEN the author gives a hotspot an id another hotspot in the same room already has
- THEN Annie refuses it

### Requirement: Exits
An exit SHALL be a hotspot with a goTo effect to another room, arriving at a floor point on that room's floor. Annie MUST refuse an exit to a room that does not exist and an arrival point that is off the floor.

#### Scenario: Linking two rooms
- WHEN the author adds an exit from one room to another with an arrival point
- THEN using the exit takes the player to the other room at that point

#### Scenario: An arrival off the floor
- WHEN the arrival point of an exit is not on the target room's floor
- THEN Annie refuses it

### Requirement: Model registry
The registry SHALL list every model by id and kind (scene, character or object), with the path of its model file in the engine, whether it is still a placeholder and, for a character, its height. For each entry Annie SHALL also keep the art spec the artist works from (a prompt, notes and reference images) and a status (placeholder, in progress or final). Annie MUST refuse a room, character or object that names a model that is not in the registry or is of the wrong kind.

#### Scenario: Adding a model
- WHEN the author adds a character model with a height and an art spec
- THEN characters can use it, and it shows as a placeholder until its file is final

#### Scenario: Replacing a placeholder
- WHEN the artist's final file is in the engine and the author marks the model final
- THEN the entry is no longer a placeholder and the rooms that use it need no change

#### Scenario: A model of the wrong kind
- WHEN a room names a character model as its scene model
- THEN Annie refuses it

### Requirement: Map and snapshots
Annie's top-down location map SHALL stay available for the rooms of a game as the author's overview of the layout. Game snapshots SHALL stay the review loop: the things in a snapshot are the room's hotspots, and a requested change to a thing's name or description SHALL apply to that hotspot.

#### Scenario: A requested rename
- WHEN a snapshot annotation asks for a hotspot to be renamed
- THEN the hotspot's name changes once the request is applied, and the request closes when a later snapshot carries the new name

### Requirement: Agent access
Rooms, hotspots, exits and the registry SHALL be readable and writable through Annie's MCP tools, with the same validation as in the app.

#### Scenario: An agent adds a hotspot
- WHEN an agent adds a hotspot to a room through the MCP tools
- THEN it appears in the app, and an invalid one is refused with the same message the app gives
