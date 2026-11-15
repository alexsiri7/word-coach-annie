import { describe, it, expect } from "vitest";
import { locationSlugs, slugify } from "@/lib/location-snapshots/slug";

describe("location slugs", () => {
    it("match the story-sync export's slugs, including dedup and code-point ordering", () => {
        // Cases and expected slugs produced by the export's Python slug() and dedup loop.
        const locations = [
            { id: "c1", name: "The Rusty Anchor" },
            { id: "c2", name: "the rusty anchor" },
            { id: "c0", name: "The Rusty Anchor-2" },
            { id: "c3", name: "Café Ünïcode 😀 Bar" },
            { id: "c4", name: "!!!" },
            { id: "c5", name: "İstanbul Straße" },
            { id: "c6", name: "  --Dock 9--  " },
            { id: "c7", name: "😀z" },
            { id: "c8", name: "￿z" },
        ];
        const byId = Object.fromEntries([...locationSlugs(locations)].map(([slug, id]) => [id, slug]));
        expect(byId).toEqual({
            c0: "the-rusty-anchor-2-2",
            c1: "the-rusty-anchor",
            c2: "the-rusty-anchor-2",
            c3: "caf-n-code-bar",
            c4: "untitled",
            c5: "i-stanbul-stra-e",
            c6: "dock-9",
            c7: "z-2",
            c8: "z",
        });
    });

    it("slugify lowercases and collapses everything but ASCII letters and digits", () => {
        expect(slugify("Sunstone Keep")).toBe("sunstone-keep");
        expect(slugify("")).toBe("untitled");
    });
});
