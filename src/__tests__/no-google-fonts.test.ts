import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

// SEC-32: fonts are self-hosted via next/font, so nothing the app ships may
// make a visitor's browser contact Google's font hosts.
const ROOT = join(__dirname, "../..");
const GOOGLE_FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;

function shippedFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "__tests__" ? [] : shippedFiles(path);
        return [path];
    });
}

function rootConfigFiles(): string[] {
    return readdirSync(ROOT, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(ts|mjs|js)$/.test(entry.name))
        .map((entry) => join(ROOT, entry.name));
}

describe("Google Fonts", () => {
    it("is not referenced by any source, public or config file", () => {
        const files = [...shippedFiles(join(ROOT, "src")), ...shippedFiles(join(ROOT, "public")), ...rootConfigFiles()];
        const offenders = files
            .filter((file) => GOOGLE_FONT_HOSTS.test(readFileSync(file, "utf-8")))
            .map((file) => relative(ROOT, file));
        expect(offenders).toEqual([]);
    });
});

// CSS custom-property fallback is silent: a font variable consumed under a
// name layout.tsx doesn't declare drops the site to fallback fonts unnoticed.
describe("Self-hosted font variables", () => {
    const read = (path: string) => readFileSync(join(ROOT, path), "utf-8");
    const declared = [...read("src/app/layout.tsx").matchAll(/variable:\s*"(--font-[\w-]+)"/g)].map((m) => m[1]).sort();
    const consumed = (path: string) => [...new Set([...read(path).matchAll(/var\((--font-[\w-]+)\)/g)].map((m) => m[1]))].sort();

    it("declares the Inter, Manrope and Newsreader variables in layout.tsx", () => {
        expect(declared).toEqual(["--font-inter", "--font-manrope", "--font-newsreader"]);
    });

    it.each(["src/app/globals.css", "tailwind.config.ts"])("are exactly the ones %s consumes", (path) => {
        expect(consumed(path)).toEqual(declared);
    });
});
