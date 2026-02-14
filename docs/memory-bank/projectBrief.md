# Project Brief: Word Coach Annie (Local Edition)

## Origin
Originated from a detailed 37-page SRS (originally "Word Coach Annie" cloud app),
significantly descoped to a local-first tool. Original SRS available at:
`Software Requirements Specification_ Word Coach Annie (1).pdf`

## What It Is
A local-first fiction writing and book management tool for novelists. Manages the
complex web of data behind a long-form narrative and exports clean Markdown for
beta readers.

## Core Value Proposition
- Manage book structure (Parts > Chapters > Scenes)
- Track story objects (Characters, Locations, Plotlines, World Elements, Notes)
- Map relationships between all entities
- Export clean Markdown for distribution
- AI assistance via Gemini CLI (user has extensive quota)

## Key Decisions Made
- **Local-first**: No cloud, no auth, no subscriptions
- **SQLite**: Single portable database file via Prisma ORM
- **Next.js + TypeScript**: Full-stack in one codebase
- **Docker**: Sandboxed development environment
- **Gemini CLI**: AI features via subprocess (not API keys)

## User Profile
- The user (Asiri) is a software engineer
- Cares about code quality but embraces vibe-coding
- Wants tests to keep specs from derailing
- Primary output: Markdown files for first readers

## Full Requirements
See `REQUIREMENTS.md` for detailed functional/non-functional requirements.
