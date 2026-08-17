---
created: '2026-08-17'
github_issue: null
id: '024'
status: draft
title: Add "Next Scene" action to scene context menu
updated: '2026-08-17'
---

## Why

Today the Structure menu only offers "Add Scene" from a Chapter/Part node, which appends a new scene as the last child. There is no quick way to insert a new scene immediately after an existing scene, in the middle of a chapter, without manually adding it at the end and dragging it into position.

## What

From a scene's context menu (the "..." actions menu in the Structure/outline tree), the author can choose "Next Scene." This opens the same "add scene" title dialog used elsewhere. On confirming a title, a new scene is created as a sibling of the current scene (same parent Chapter/Part), positioned immediately after it in the outline order. All scenes after the insertion point shift down. The new scene becomes selected in the outline after creation.

## Issues

_None yet._