# Offline and Updates

## Purpose

Writing sessions happen on trains, planes and patchy café wifi. Annie keeps working without a connection, syncs when one returns, and never throws away an author's words — not on a sync conflict, not on reconnection, and not because a new version was deployed.

## Requirements

### Requirement: Projects open offline

While offline, the app SHALL show the author's projects, outlines and scene content as last seen online, and SHALL show an offline page rather than a browser error for pages it has not cached.

#### Scenario: Open a scene on a plane
- GIVEN the author viewed a scene while online yesterday
- WHEN they open it with no connection
- THEN the scene content is shown

### Requirement: Offline edits are queued and replayed in order

While offline, changes SHALL be saved locally and queued; reads and non-API requests SHALL NOT be queued. When connectivity returns, queued changes SHALL be replayed in their original order. A change that fails SHALL be retried up to a limit and then set aside for the author rather than retried forever.

#### Scenario: Reconnect syncs
- GIVEN the author made three edits offline
- WHEN the connection returns
- THEN the three edits reach the server in the order they were made

### Requirement: Conflicts are resolved by the author

When a replayed change finds the server content has changed since, it SHALL be marked as a conflict with the server's version attached and skipped by automatic replay. The author SHALL be shown both versions as a diff and choose to keep theirs or the server's. Work SHALL never be discarded silently.

#### Scenario: Keep mine
- GIVEN an offline edit conflicts with an edit made on another device
- WHEN the author opens the conflict and chooses to keep theirs
- THEN their version is written and the conflict clears

### Requirement: Sync state is always visible

The header SHALL show one of: up to date, offline with the number of pending changes, syncing, or conflict. Offline and online state, the sync indicator and AI availability SHALL update in place as connectivity changes.

#### Scenario: Pending count
- GIVEN the author is offline with two unsynced edits
- WHEN they look at the header
- THEN it reads offline with 2 pending

### Requirement: The page is never reloaded without the author's say

Regaining connectivity SHALL never reload or navigate the page, and a new app version or service worker taking control SHALL never reload it either. When a new version is available the app SHALL show a dismissible update banner, and the page SHALL reload only when the author chooses to refresh from it. Unsaved editor content SHALL survive the offline-to-online transition untouched.

#### Scenario: Reconnect mid-sentence
- GIVEN the author is typing in a scene while offline
- WHEN the connection returns
- THEN the page does not reload and the unsaved text is still in the editor

#### Scenario: Deploy while offline
- GIVEN a new version was deployed while the author was offline
- WHEN they come back online
- THEN an update banner appears
- AND the page reloads only if they choose Refresh
