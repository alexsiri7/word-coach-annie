---
created: '2026-06-23'
github_issue: null
id: '022'
status: draft
title: Persistent sessions — stay logged in across restarts
updated: '2026-06-23'
---

## Why

The JWT session cookie currently expires after 1 hour with no refresh mechanism. Every server restart resets active sessions, and any hour-long gap in activity logs the user out. This breaks autosave (which requires an authenticated session) and forces repeated logins during a writing session.

## What

Users should remain logged in for at least 30 days of inactivity, and indefinitely as long as they are actively using Annie. A user who opens Annie every day should never have to re-authenticate until they explicitly log out. Autosave must not silently fail due to an expired session.

## Issues

_None yet._