---
id: "010"
title: "Google Docs export and sync"
status: "done"
github_issue: 610
updated: 2026-05-12
---

## Why
Google Docs is the standard for manuscript sharing with collaborators and editors. Idempotent sync means re-exporting doesn't create duplicate documents.

## What
OAuth-based Google Docs export with three sync modes: Universe, Internal, Reader. Idempotent: re-running sync updates the existing Doc rather than creating a new one.
