import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";

// WCA-037: the app must never reload itself unprompted. The only path to
// window.location.reload() is the update banner's explicit refresh action.

const pwaOptions = vi.hoisted(() => ({ value: undefined as Record<string, unknown> | undefined }));

vi.mock("@ducanh2912/next-pwa", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ducanh2912/next-pwa")>();
  return {
    ...actual,
    default: (options: Parameters<typeof actual.default>[0]) => {
      pwaOptions.value = options as Record<string, unknown>;
      return actual.default(options);
    },
  };
});

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, default: { ...actual, writeFileSync: vi.fn() }, writeFileSync: vi.fn() };
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("PWA reload policy (WCA-037)", () => {
  it("disables the service worker registration script's reload on the online event", async () => {
    await import("../../next.config");
    expect(pwaOptions.value?.reloadOnOnline).toBe(false);
  });

  it("only calls location.reload() from the version-check refresh action", () => {
    const root = join(__dirname, "..");
    const callers = sourceFiles(root)
      .filter((file) => /location\.reload\s*\(/.test(readFileSync(file, "utf-8")))
      .map((file) => relative(root, file));
    expect(callers).toEqual(["hooks/use-version-check.ts"]);
  });
});
