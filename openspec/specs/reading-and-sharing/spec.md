# Reading and Sharing

## Purpose

The Read view presents the manuscript as a reader would meet it, and is where the author and invited readers leave notes. Sharing lets the author bring in beta readers and co-editors without giving away ownership.

## Requirements

### Requirement: Read view shows the written manuscript

Opening a project's Read view SHALL render its chapters and scenes in order, including only scenes whose status is Draft, Revised or Final. Outline scenes SHALL be excluded.

#### Scenario: Outline scenes hidden
- GIVEN a chapter with one Outline scene and one Draft scene
- WHEN a reader opens the Read view
- THEN only the Draft scene is shown

### Requirement: Range annotations

A user with access SHALL be able to select text in the Read view or editor and attach an annotation. The annotation SHALL keep its selected text and range, be shown as a highlight in both the Read view and the editor, follow its text when surrounding content shifts, and be resolvable or deletable. Resolved annotations SHALL no longer be highlighted.

#### Scenario: Annotation made in Read view appears in editor
- GIVEN a reader highlights a sentence in the Read view and adds a note
- WHEN the author opens that scene in the editor
- THEN the same sentence is highlighted with the note

#### Scenario: Resolve
- GIVEN an open annotation
- WHEN the author resolves it
- THEN its highlight disappears

### Requirement: Writing tasks are reachable from the Read view

The Read view selection popover SHALL offer adding a writing task for the selected passage, and the Read view SHALL offer a tasks drawer — as easy to find as annotations — listing the project's tasks with name and completion status and letting the author mark tasks complete without leaving the page.

#### Scenario: Complete a task while reading
- GIVEN a project with an open task "Tighten the harbour scene"
- WHEN the author opens the tasks drawer in the Read view and marks it complete
- THEN the task shows as completed in the drawer and on the project's tasks page

### Requirement: Projects are shared by role

The owner SHALL be able to share a project by email as Reader or Editor, defaulting to Reader when no valid role is given, and SHALL be the only one able to list, change or remove shares. Sharing the same email twice SHALL be refused. Shared users SHALL get access according to their role; everyone else SHALL be refused.

#### Scenario: Default role
- GIVEN the owner shares with an email and no role
- WHEN the share is created
- THEN it is a Reader share

#### Scenario: Stranger refused
- GIVEN a user the project is not shared with
- WHEN they request its manuscript
- THEN access is refused
