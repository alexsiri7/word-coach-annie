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

### Requirement: Timeline matrix

The author SHALL be able to view a matrix of story objects against scenes in outline order, showing in which scenes each character, location or plotline appears, derived from relationships.

#### Scenario: Presence shown
- GIVEN Mara appears in scenes 1 and 3 but not 2
- WHEN the author opens the timeline
- THEN Mara's row is marked in columns 1 and 3 only
