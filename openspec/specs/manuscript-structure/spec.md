# Manuscript Structure

## Purpose

A project is one piece of writing — a novel, a story, an article collection — organised as a tree the author can reshape at will. The structure is the backbone every other capability hangs off: editing, story objects, reading, export and submissions all address a project and its scenes.

## Requirements

### Requirement: Projects have a lifecycle

An authenticated author SHALL be able to create, rename, archive, unarchive and delete projects. The dashboard SHALL list active projects with their word count and last-modified date. Archiving SHALL hide a project from the active list without deleting anything; deleting SHALL remove the project together with its structure, content, versions and story objects.

#### Scenario: Archive keeps data
- GIVEN an active project with three scenes
- WHEN the author archives it
- THEN it disappears from the active dashboard list
- AND unarchiving restores it with all three scenes intact

#### Scenario: Delete removes everything
- GIVEN a project with scenes, versions and story objects
- WHEN the author deletes it
- THEN the project and everything it owns is gone

### Requirement: Project types adapt the vocabulary

A project SHALL have one of the types fiction, article collection or general. All types SHALL share the same structure model, and the interface SHALL label levels to match the type — for example Chapter and Scene for fiction, Article and Section for an article collection.

#### Scenario: Article collection labels
- GIVEN an article-collection project
- WHEN the author views its outline
- THEN the levels read Article and Section where a fiction project reads Chapter and Scene

### Requirement: Manuscripts are a Part, Chapter, Scene tree

Each project SHALL hold a tree of Parts, Chapters and Scenes. Every node SHALL carry a title, a synopsis, an order position and a status of Outline, Draft, Revised or Final, shown colour-coded in the outline. The author SHALL be able to create, rename, delete and reorder nodes at any level, including dragging a node to a different parent, with sibling order kept consistent.

#### Scenario: Move a scene to another chapter
- GIVEN chapter 1 with scenes A, B and chapter 2 with scene C
- WHEN the author drags B to just before C
- THEN chapter 1 holds A and chapter 2 holds B, C in that order

### Requirement: A scene can be inserted in place

A scene's actions menu SHALL offer Next Scene. Confirming a title SHALL create a new scene under the same parent, immediately after the current scene, shifting later siblings down, and SHALL select the new scene.

#### Scenario: Insert mid-chapter
- GIVEN a chapter with scenes A, B, C
- WHEN the author chooses Next Scene on A and enters "A2"
- THEN the chapter reads A, A2, B, C
- AND A2 is selected in the outline

### Requirement: Projects are searchable

The author SHALL be able to search a project's scene content and story objects in one query and receive matches with highlighted snippets. Overlong queries SHALL be rejected rather than executed.

#### Scenario: Search hits a character and a scene
- GIVEN a character named Mara and a scene mentioning Mara
- WHEN the author searches for "Mara"
- THEN both the character and the scene are returned with the term highlighted
