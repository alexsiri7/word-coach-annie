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
