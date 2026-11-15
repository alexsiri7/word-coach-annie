import { describe, it, expect } from "vitest";
import { describeLocationMapError, LocationMapInputSchema } from "@/schemas/location-map";

const items = [
    { id: "o", kind: "object", x: 1, y: 1, w: 1, h: 1, storyObjectId: "so-1" },
    { id: "c", kind: "character", x: 2, y: 2, w: 0.6, h: 0.6, storyObjectId: "so-2" },
    { id: "e", kind: "exit", x: 0, y: 4, w: 1, h: 0.3, rotation: -90, targetLocationId: "so-3" },
    { id: "a", kind: "area", x: 6, y: 4, w: 4, h: 2, points: [[-2, -1], [2, -1], [0, 1]] },
    { id: "n", kind: "note", x: 3, y: 3, w: 0.4, h: 0.4, label: "Draughty" },
];

function refusal(map: unknown): string {
    const parsed = LocationMapInputSchema.safeParse(map);
    expect(parsed.success).toBe(false);
    return parsed.success ? "" : describeLocationMapError(parsed.error);
}

const withItem = (item: Record<string, unknown>) => ({ widthM: 12, heightM: 8, items: [item] });

describe("LocationMapInputSchema", () => {
    it("accepts one item of every kind, fills defaults and normalises rotation", () => {
        const parsed = LocationMapInputSchema.parse({ widthM: 12, heightM: 8, items });
        expect(parsed.backgroundImageId).toBeNull();
        expect(parsed.items.map((i) => i.kind)).toEqual(["object", "character", "exit", "area", "note"]);
        expect(parsed.items[0]).toMatchObject({ label: "", description: "", rotation: 0 });
        expect(parsed.items[2].rotation).toBe(270);
    });

    it("strips the read-only fields a read returns", () => {
        const parsed = LocationMapInputSchema.parse(withItem({ ...items[1], linkName: "Kael", unlinked: false }));
        expect(parsed.items[0]).not.toHaveProperty("linkName");
        expect(parsed.items[0]).not.toHaveProperty("unlinked");
    });

    it.each([
        ["an unknown kind", withItem({ ...items[0], kind: "door" }), /^items\.0\.kind: /],
        ["an area without points", withItem({ ...items[3], points: undefined }), "items.0.points: points are required on area items and only allowed on them"],
        ["points on a non-area", withItem({ ...items[4], points: [[0, 0], [0.1, 0], [0, 0.1]] }), /points are required on area/],
        ["an area point outside its box", withItem({ ...items[3], points: [[-5, 0], [2, -1], [0, 1]] }), /must lie within the item's width and height/],
        ["a duplicate item id", { widthM: 12, heightM: 8, items: [items[4], items[4]] }, "items: duplicate item id n"],
        ["a zero width", { widthM: 0, heightM: 8, items: [] }, /^widthM: /],
        ["a string coordinate", withItem({ ...items[0], x: "1" }), /^items\.0\.x: /],
        ["a zero size", withItem({ ...items[0], w: 0 }), "items.0.w: must be greater than 0"],
        ["a storyObjectId on a note", withItem({ ...items[4], storyObjectId: "so-1" }), /storyObjectId is only allowed on object and character items/],
        ["a targetLocationId on a character", withItem({ ...items[1], targetLocationId: "so-3" }), /targetLocationId is only allowed on exit items/],
        ["a missing items list", { widthM: 12, heightM: 8 }, /^items: /],
    ])("refuses %s", (_label, map, message) => {
        expect(refusal(map)).toMatch(message);
    });
});
