# Scene Editing

## Purpose

The scene editor is where the author writes. It must never lose words, never let an agent or second device silently overwrite them, and keep structural notes (beats) visibly separate from prose.

## Requirements

### Requirement: Scenes auto-save

The scene editor SHALL be a rich-text editor supporting bold, italic, headings and lists, and SHALL save content automatically after the author pauses typing, without a save action. Saving SHALL update the scene's and the project's word counts.

#### Scenario: Typing persists
- GIVEN an open scene
- WHEN the author types a paragraph and stops
- THEN the content is saved without pressing anything
- AND the scene and project word counts reflect the new words

### Requirement: Every save is a recoverable version

Each save SHALL create a new version of the scene. The system SHALL keep at least the latest 50 versions per scene and MAY prune older ones. The author SHALL be able to view version history and restore any kept version; a restore SHALL create a new head version and SHALL NOT rewrite history.

#### Scenario: Restore an earlier version
- GIVEN a scene with versions 1 to 5
- WHEN the author restores version 2
- THEN version 6 exists with version 2's content
- AND versions 1 to 5 are unchanged

### Requirement: Writes never silently clobber newer content

Any scene write from an agent or a replayed offline edit SHALL name the content it expects to replace. When that does not match the scene's current content, the write SHALL be refused with a stale-content error and the scene SHALL be left unchanged.

#### Scenario: Stale write refused
- GIVEN an agent read a scene, then the author edited it
- WHEN the agent writes using the content fingerprint from its earlier read
- THEN the write is refused as stale
- AND the author's edit remains

### Requirement: Beats are structural notes, not prose

A scene MAY contain beats — short structural waypoints, possibly spanning several lines. The editor SHALL render beats as cards visually distinct from prose. Beats SHALL never appear in the Read view or in any reader-facing export or publication; only an export explicitly meant for the author's own working copy MAY include them.

#### Scenario: Beat stays out of export
- GIVEN a scene containing a beat between two paragraphs
- WHEN the project is downloaded, exported to Markdown or published
- THEN the output contains both paragraphs and no beat text

#### Scenario: Multi-line beat
- GIVEN a beat whose text runs over two lines
- WHEN the project is downloaded as PDF, EPUB or DOCX
- THEN no part of the beat appears

### Requirement: Focus mode

The author SHALL be able to open any scene in focus mode: a distraction-free layout showing scene information, the editor, and the story elements related to that scene.

#### Scenario: Enter focus mode
- GIVEN a scene related to two characters
- WHEN the author opens it in focus mode
- THEN the editor is shown with the scene's details on one side and the two characters on the other

### Requirement: On-device spelling and grammar checking

While checking is enabled, the editor SHALL flag misspellings and grammar issues inline as the author types and offer suggestions to accept or dismiss on click. Checking SHALL run entirely on the device, work offline and send no manuscript text anywhere. It SHALL be advisory, never blocking save. A toolbar toggle SHALL turn it off and on for the session, restoring flags when re-enabled, and it SHALL behave the same in development and production builds.

#### Scenario: Accept a correction
- GIVEN checking is on and the author types "teh"
- WHEN the author clicks the flagged word and picks "the"
- THEN the word is replaced
- AND no network request carried the text

#### Scenario: Toggle back on
- GIVEN the author turned checking off
- WHEN they turn it back on
- THEN existing issues are flagged again

### Requirement: Writing sessions are tracked

The system SHALL record writing sessions automatically — project, scene, words written, duration and date — and SHALL present progress views including a heatmap of writing activity over time.

#### Scenario: A day's writing appears
- GIVEN the author writes 500 words today
- WHEN they open the progress view
- THEN today's cell on the heatmap reflects 500 words
