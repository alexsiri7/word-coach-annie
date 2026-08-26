---
created: '2026-08-26'
github_issue: null
id: '027'
status: draft
title: Fix Harper spell/grammar checker not loading under the Turbopack dev server
updated: '2026-08-26'
---

## Why

next.config.ts's `webpack()` function sets `experiments.asyncWebAssembly`/`layers`, which is required for harper.js's WASM binary (located via `new URL("harper_wasm_bg.wasm", import.meta.url)` inside the installed package) to resolve correctly. Turbopack does not read the `webpack()` config function at all, and `package.json`'s `dev` script has no `--webpack` flag, so local dev (Turbopack, default in Next 16) silently skips this config. Turbopack's own docs note it can fail to bundle non-JS assets like `.wasm` files referenced from inside a node_modules package unless given an explicit `resolveAlias`/rule. The net effect: the spell/grammar checker likely never initializes under `next dev`, with no visible error, while `next build --webpack` (what's used for production and was presumably used when Issues #1000-1002 were verified) works fine — a silent dev/prod bundler divergence.

## What

Inline spelling/grammar checking (Req 026) works identically whether the app is run via `next dev` (Turbopack, the default in Next.js 16) or `next build --webpack` (production). The Harper WASM binary loads successfully and lints render in both environments, so testing locally with `npm run dev` reflects what will actually ship.

## Issues

_None yet._