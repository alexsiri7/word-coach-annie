# Accounts and Security

## Purpose

Annie holds unpublished manuscripts, so access is invitation-only, sessions are long-lived for the author but revocable, every request is checked against the project it touches, and nothing private leaks into logs or third-party services. The author can take all their data out, or delete it, at any time.

## Requirements

### Requirement: Invite-only Google sign-in

Users SHALL sign in with Google. When an allowlist of emails is configured, sign-in from any other email SHALL be refused with an invite-only message and no session; matching SHALL ignore case and surrounding whitespace.

#### Scenario: Not invited
- GIVEN an allowlist that does not include the user's email
- WHEN they complete Google sign-in
- THEN they return to the login page with an invite-only message and are not signed in

### Requirement: Everything but public pages requires authentication

Every request outside a public set — health check, sign-in and sign-out, landing, privacy, terms, DMCA, version check, OAuth metadata, registration and token endpoints, and the calendar feed — SHALL require a valid session, API token or MCP OAuth token, and SHALL be refused otherwise.

#### Scenario: Anonymous API call
- GIVEN no credentials
- WHEN a request is made to a project API
- THEN it is refused as unauthenticated

### Requirement: Sessions last while the author is active

A signed-in author SHALL stay signed in for at least 30 days of inactivity and indefinitely while active, with short-lived sessions refreshed transparently so autosave never fails on an expired session. Signing out SHALL revoke the refresh credential so it cannot be reused.

#### Scenario: Daily writer
- GIVEN an author who opens Annie every day
- WHEN a month has passed
- THEN they have never been asked to sign in again

#### Scenario: Reuse after sign-out
- GIVEN the author signed out
- WHEN the old refresh credential is presented
- THEN it is rejected

### Requirement: Access is checked per project

Every project-scoped operation, from the web or from an agent, SHALL verify the caller owns the project or has a share with a role permitting the operation, and SHALL refuse otherwise. A locally run single-user MCP server with no user identity MAY skip ownership checks.

#### Scenario: Reader cannot edit
- GIVEN a user with a Reader share
- WHEN they try to change a scene
- THEN the change is refused

### Requirement: Requests are rate-limited per user

The system SHALL limit each user per endpoint class — chat, reads, writes, project creation, project import, feedback — and SHALL answer excess requests with a too-many-requests response carrying retry timing. The ability to disable rate limiting SHALL have no effect in production.

#### Scenario: Chat flood
- GIVEN a user exceeds the chat limit within a minute
- WHEN they send another message
- THEN it is refused with a retry-after time

### Requirement: Input is validated and content is sanitised

All input SHALL be validated against a schema and per-endpoint size limits before processing, and stored HTML SHALL be sanitised on write and on render so scripts and event handlers cannot run. Pages SHALL be served with a content security policy that allows only the app's own and per-request-nonced scripts and forbids framing.

#### Scenario: Script in content
- GIVEN a scene save containing a script tag
- WHEN it is saved and rendered
- THEN the script is stripped and never runs

### Requirement: Secrets and manuscripts stay private

Stored third-party credentials SHALL be encrypted at rest and returned only masked. Error reports sent to monitoring SHALL be scrubbed of manuscript text and personal data. Spelling and grammar checking SHALL not send text off the device.

#### Scenario: Crash report
- GIVEN an error occurs while saving a scene
- WHEN the error is reported to monitoring
- THEN the report contains no scene text or email address

### Requirement: Users own their data

A user SHALL be able to download all their data, delete their account with everything they own and every session, and record consent choices. Privacy, terms and DMCA pages SHALL be public. Users SHALL be able to send feedback, optionally with a screenshot, which is filed as an issue in the project's tracker, rate-limited and size-limited.

#### Scenario: Delete account
- GIVEN a user with two projects
- WHEN they delete their account
- THEN both projects are gone and their sessions no longer work

### Requirement: Safe to operate

The app SHALL expose an unauthenticated health check, report errors from browser and server, run within its memory budget on a small container, and apply schema migrations automatically at start-up while refusing any migration that would destroy populated data. Features whose configuration is absent SHALL be disabled with a clear message rather than crash the app.

#### Scenario: Destructive migration refused
- GIVEN a migration that would drop a table containing rows
- WHEN the container starts
- THEN the migration is refused and the data is untouched
