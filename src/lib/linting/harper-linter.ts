/**
 * Harper.js linter wrapper — only call from client components (WASM runs in the browser).
 * Lazily loads harper-wasm on first use so the ~1-2 MB WASM bundle doesn't block initial page load.
 */

import type { Lint } from "harper-wasm";

let initialized = false;
let initPromise: Promise<void> | null = null;
let harperModule: typeof import("harper-wasm") | null = null;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      harperModule = await import("harper-wasm");
      await harperModule.setup();
      initialized = true;
    })().catch((err) => {
      initPromise = null; // allow retry on next call
      console.error("[harper-linter] WASM initialization failed:", err);
      throw err;
    });
  }
  return initPromise;
}

/** Get the current lint configuration as an object. */
export async function getLintConfig(): Promise<unknown> {
  await ensureInitialized();
  return harperModule!.get_lint_config_as_object();
}

/** Set the lint configuration from an object. */
export async function setLintConfig(config: unknown): Promise<void> {
  await ensureInitialized();
  harperModule!.set_lint_config_from_object(config);
}

/** Lint the given text and return an array of lint issues. */
export async function lintText(text: string): Promise<Lint[]> {
  await ensureInitialized();
  try {
    return harperModule!.lint(text);
  } catch (err) {
    console.error("[harper-linter] lint() failed:", err);
    return [];
  }
}
