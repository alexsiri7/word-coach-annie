# Writing Tasks

## Purpose

Writing tasks capture what the author needs to do next — not only drafting but reading, gathering material, revising and admin — so that on any day, whatever state the writer is in, there is something useful and doable, and an AI collaborator knows the plate without being re-briefed.

## Requirements

### Requirement: Tasks describe the work and the writer it suits

A writing task SHALL carry a name, what is needed, importance, size, energy, a kind (Draft, Revise, Read, Gather or Admin), a capacity (Low, Medium or Full — the writer state the task suits), a completion flag, and optionally a due date. A task SHALL belong to a project or to no project (a practice-level task), and MAY be linked to a scene. Tasks SHALL be creatable, editable, completable and deletable from the web UI and by an agent, and only by someone with access to their project or, for practice tasks, their creator.

#### Scenario: Practice task without a project
- GIVEN the author wants to "Read one Alice Munro story"
- WHEN they create it with kind Read, capacity Low and no project
- THEN the task exists and is visible only to them

#### Scenario: Another user's task
- GIVEN a task in a project the caller cannot access
- WHEN the caller tries to complete it
- THEN the request is refused

### Requirement: One dashboard across all projects

The web UI SHALL provide a task dashboard showing tasks from every project plus practice tasks in one place. It SHALL offer a "how are you today?" capacity picker (Low, Medium, Full) that filters everything below it to tasks suited to that capacity or less; an upcoming-deadlines strip listing open opportunity deadlines and task due dates soonest first; a "suggested now" section; tasks grouped by project; and a small "done this week" section.

#### Scenario: Low-capacity day
- GIVEN tasks of capacity Low, Medium and Full
- WHEN the author picks Low
- THEN only Low-capacity tasks are shown in suggestions and project groups

#### Scenario: Deadlines strip
- GIVEN a contest closing in 10 days and a task due in 3 days
- WHEN the author opens the dashboard
- THEN the strip lists the task first and the contest second

### Requirement: Suggestions fit the writer's state

"Suggested now" SHALL propose a small number of open tasks (five by default) whose capacity does not exceed the chosen capacity, ranked by importance, then nearest deadline — the task's due date or else its project's nearest open opportunity deadline — then smallest size.

#### Scenario: Deadline breaks an importance tie
- GIVEN two High-importance Low-capacity tasks, one due tomorrow and one undated
- WHEN suggestions are computed for Low capacity
- THEN the task due tomorrow is suggested first

### Requirement: Agents read the same dashboard in one call

An agent SHALL be able to fetch the cross-project dashboard — suggestions, deadlines, tasks by project and recent completions — in a single call, optionally filtered by capacity, kind or project. The collaboration instructions given to agents SHALL tell them to fetch it at the start of a session, and to capture tasks linked to the relevant scene during coaching, as tasks for the author to do, never by writing the prose themselves.

#### Scenario: Session start
- GIVEN an agent begins a session with Annie
- WHEN it reads the initial instructions
- THEN they direct it to fetch the task dashboard first

#### Scenario: Filtered fetch
- GIVEN tasks of several kinds
- WHEN an agent fetches the dashboard filtered to kind Read
- THEN only Read tasks are returned
