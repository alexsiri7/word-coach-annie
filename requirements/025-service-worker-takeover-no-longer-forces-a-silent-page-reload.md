---
created: '2026-08-25'
github_issue: null
id: '025'
status: draft
title: Service worker takeover no longer forces a silent page reload
updated: '2026-08-25'
---

## Why

sw-lifecycle.tsx unconditionally calls window.location.reload() on every service worker "controllerchange" event. Because next.config.ts sets skipWaiting: true and clientsClaim: true, a new service worker (e.g. from a deploy that happened while the author was offline) takes control and fires this reload as soon as connectivity is restored and the browser checks for updates. This causes an unprompted full-page reload exactly when switching from offline to online, discarding any unsaved scene content. Annie already has a better-behaved pattern for this in use-version-check.ts, which surfaces a dismissible "update available" banner instead of reloading automatically, consistent with the product principle that authors remain in control of when their work is interrupted.

## What

Regaining network connectivity after being offline never triggers an unprompted full-page reload or navigation; any in-progress unsaved editor content survives the offline-to-online transition undisturbed. If a new app version became available while the author was offline or working, Annie does not silently reload out from under them — the author is only ever prompted (via the existing update-available banner) to refresh when they choose to, never forced. Offline/online UI state (the offline indicator, sync status chip, AI chat availability) continues to update reactively without any page reload or navigation being involved.

## Issues

_None yet._