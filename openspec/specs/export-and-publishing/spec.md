# Export and Publishing

## Purpose

The manuscript has to leave Annie in whatever form the next reader expects — a Word file for an editor, an EPUB for a beta reader, a Google Doc for comments, a post on a blog — and come back in again when it travels. Reader-facing exports are always clean prose: structural notes never leak out.

## Requirements

### Requirement: Markdown export

The author SHALL be able to export a project as Markdown in three shapes: the full manuscript with front matter and part, chapter and scene headings; one file per chapter; or a story bible listing every story object with its description. Options SHALL control whether synopses, scene breaks and chapter numbering are included.

#### Scenario: Story bible
- GIVEN a project with four characters and two locations
- WHEN the author exports the story bible
- THEN the Markdown lists all six with their descriptions

#### Scenario: Synopses off
- GIVEN scenes with synopses
- WHEN the author exports the manuscript with synopses disabled
- THEN no synopsis text appears

### Requirement: Read view downloads

The Read view download menu SHALL offer PDF, EPUB 3 and DOCX. Each download SHALL contain a title page and the part and chapter headings with scene prose, covering the same scenes the Read view shows. DOCX body text SHALL be Arial 12pt, left-justified. No download SHALL contain beat text.

#### Scenario: Download DOCX
- GIVEN a project with two chapters of drafted scenes
- WHEN a reader chooses Download DOCX
- THEN a .docx file downloads with both chapters in Arial 12pt left-justified paragraphs

#### Scenario: Outline scenes stay out of downloads
- GIVEN a chapter containing an Outline scene with placeholder text
- WHEN any download format is produced
- THEN the placeholder text is absent

### Requirement: Google Docs export with comment round-trip

A user who has connected Google Docs, separately from signing in, SHALL be able to export to Google Docs in three modes: a universe's canon; an internal working copy with the story bible and the manuscript including beats; or a clean reader manuscript without beats. Repeating an export for the same entity and mode SHALL update the existing Doc rather than create a duplicate. Syncing SHALL import the Doc's comments as Annie annotations, skipping comments already imported.

#### Scenario: Idempotent export
- GIVEN a project already exported in Reader mode
- WHEN the author exports it in Reader mode again
- THEN the same Doc is updated and no second Doc is created

#### Scenario: Comments come back once
- GIVEN a Doc with two comments, one already imported
- WHEN the author syncs
- THEN exactly one new annotation is created

### Requirement: Article publishing

For article projects the system SHALL produce Medium-ready Markdown with front matter, and SHALL publish to Hashnode using a Hashnode credential the author stored once, recording each publish and its status.

#### Scenario: Publish to Hashnode
- GIVEN the author has stored a Hashnode token
- WHEN they publish an article
- THEN a Hashnode post is created
- AND the publish is recorded against the article

### Requirement: Portable project JSON

The author SHALL be able to export a project as a complete JSON document and import such a document to recreate the project, including structure, content, story objects and relationships. Oversized imports SHALL be rejected without being processed.

#### Scenario: Round trip
- GIVEN a project with scenes, characters and relationships
- WHEN it is exported to JSON and imported
- THEN the new project has the same structure, content, story objects and relationships
