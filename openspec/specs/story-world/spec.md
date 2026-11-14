# Story World

## Purpose

Writers need a story bible that stays attached to the manuscript: who the characters are, where things happen, which plotlines run through which scenes. Universes let several projects share one canon without duplicating it.

## Requirements

### Requirement: Story objects

Each project SHALL hold story objects of five types — Character, Location, Plotline, World Element and Note — each with a name, description, notes and free-form tags. The author SHALL be able to create, read, update and delete them, list them filtered by type, and find them by name.

#### Scenario: Filter by type
- GIVEN a project with three characters and two locations
- WHEN the author filters the story objects to Location
- THEN exactly the two locations are listed

### Requirement: Locations carry images

The project owner SHALL be able to attach images of kind reference, mood or sketch to a location story object, caption them, reorder them, mark one as the cover shown in the location list, and delete them, on desktop and mobile and through MCP.

#### Scenario: First image is the cover
- GIVEN a location with no images
- WHEN the owner uploads an image
- THEN it is listed with kind reference and marked as the cover

### Requirement: Location images are private and re-encoded

Uploads SHALL be re-encoded to WebP at most 2048 px on the longest side with a 400 px thumbnail and no metadata, and refused when they are not an image or exceed 20 MB. Images SHALL be stored privately and served only to the project owner, through short-lived signed URLs.

#### Scenario: Upload is re-encoded
- GIVEN a 3000×2000 JPEG carrying GPS metadata
- WHEN the owner uploads it
- THEN a 2048×1365 WebP without metadata is stored

#### Scenario: Non-image refused
- WHEN a text file is uploaded as an image
- THEN the upload is refused and nothing is stored

#### Scenario: Stranger refused
- GIVEN another user, even one the project is shared with
- WHEN they request a location image or its file
- THEN the request is refused and no signed URL is issued

### Requirement: Locations carry a map

The project owner SHALL be able to sketch a top-down map of a location in metres, optionally over one of its images, and place, move, resize, rotate, describe and delete objects, characters, exits, areas and notes on it, with a mouse or by touch and through MCP. Maps SHALL be validated on every write.

#### Scenario: Invalid map refused
- WHEN a map with an item of an unknown kind is saved, over the API or MCP
- THEN it is refused with the problem and nothing is stored

#### Scenario: Renamed link follows
- GIVEN a map item linked to the character Kael
- WHEN Kael is renamed
- THEN the item shows the new name

#### Scenario: Deleted target leaves an unlinked item
- GIVEN a map item linked to a character
- WHEN the character is deleted
- THEN the item stays on the map, marked unlinked, and the map can still be saved

#### Scenario: Exit opens the other map
- GIVEN an exit linked to another location
- WHEN the author double-clicks it
- THEN that location's map opens

### Requirement: Typed relationships between entities

The author or an agent SHALL be able to link any two entities — scenes, story objects, or world objects of a universe the project is linked to — with a typed relationship such as appears in, located at, part of plotline or related to. Every relationship SHALL be visible from both ends, and each entity SHALL show all relationships touching it.

#### Scenario: Relate a local character to universe canon
- GIVEN a project linked to a universe that holds the location "Old Harbour"
- WHEN the author relates local character Mara to Old Harbour as located at
- THEN the relationship is accepted without copying Old Harbour into the project
- AND it is listed on both Mara and Old Harbour

#### Scenario: Object outside the linked universe
- GIVEN a world object from a universe the project is not linked to
- WHEN a relationship to it is requested
- THEN the request is refused as not found in this project or its linked universe

### Requirement: Universes share canon across projects

The author SHALL be able to create universes, link and unlink projects to them, and manage universe-scoped world objects of type Character, Location or World Element. Each world object SHALL carry an ordered timeline of entries recording how it changes across the universe's stories, which the author can add to, edit, reorder and delete. A project's story object SHALL be transferable into a universe as a world object.

#### Scenario: Two projects share a character
- GIVEN universe U with world object "Captain Reyes" and projects P1 and P2 linked to U
- WHEN either project relates a scene to Captain Reyes
- THEN both projects see the same Captain Reyes and the same timeline

#### Scenario: Location with images not transferred
- GIVEN a project location that has images
- WHEN the author moves it to the universe
- THEN the move is refused until its images are removed, because world objects hold no images

#### Scenario: Location with a map not transferred
- GIVEN a project location that has a map
- WHEN the author moves it to the universe
- THEN the move is refused until its map is deleted, because world objects hold no maps

### Requirement: Timeline matrix

The author SHALL be able to view a matrix of story objects against scenes in outline order, showing in which scenes each character, location or plotline appears, derived from relationships.

#### Scenario: Presence shown
- GIVEN Mara appears in scenes 1 and 3 but not 2
- WHEN the author opens the timeline
- THEN Mara's row is marked in columns 1 and 3 only
