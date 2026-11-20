import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";

// WCA-037: the app must never reload itself unprompted. The only path to
// window.location.reload() is the update banner's explicit refresh action.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("PWA reload policy (WCA-037)", () => {
  it("disables the service worker registration script's reload on the online event", () => {
    const config = readFileSync(join(__dirname, "../../next.config.ts"), "utf-8");
    const pwaCall = config.match(/withPWA\(\{[\s\S]*?\n\}\)/)?.[0];
    expect(pwaCall).toMatch(/reloadOnOnline:\s*false\s*,/);
  });

  it("only calls location.reload() from the version-check refresh action", () => {
    const root = join(__dirname, "..");
    const callers = sourceFiles(root)
      .filter((file) => /location\.reload\s*\(/.test(readFileSync(file, "utf-8")))
      .map((file) => relative(root, file));
    expect(callers).toEqual(["hooks/use-version-check.ts"]);
  });
});
