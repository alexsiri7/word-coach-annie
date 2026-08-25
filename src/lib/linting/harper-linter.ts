/**
 * Harper.js linter wrapper — only call from client components (WASM runs in the browser).
 * Lazily loads harper.js on first use so the ~1-2 MB WASM bundle doesn't block initial page load.
 */

import type { Lint, Linter, LintConfig } from "harper.js";

let linter: Linter | null = null;
let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (linter) return;
  if (!initPromise) {
    initPromise = (async () => {
      const [{ LocalLinter }, { binary }] = await Promise.all([
        import("harper.js"),
        import("harper.js/binary"),
      ]);
      linter = new LocalLinter({ binary });
      await linter.setup();
    })().catch((err) => {
      initPromise = null; // allow retry on next call
      linter = null;
      console.error("[harper-linter] WASM initialization failed:", err);
      throw err;
    });
  }
  return initPromise;
}

/** Get the current lint configuration. */
export async function getLintConfig(): Promise<LintConfig> {
  await ensureInitialized();
  return linter!.getLintConfig();
}

/** Set the lint configuration. */
export async function setLintConfig(config: LintConfig): Promise<void> {
  await ensureInitialized();
  await linter!.setLintConfig(config);
}

/** Lint the given text and return an array of lint issues. */
export async function lintText(text: string): Promise<Lint[]> {
  await ensureInitialized();
  try {
    return await linter!.lint(text);
  } catch (err) {
    console.error("[harper-linter] lint() failed:", err);
    return [];
  }
}
