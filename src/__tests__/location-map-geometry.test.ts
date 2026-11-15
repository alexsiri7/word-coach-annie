import { describe, it, expect } from "vitest";
import type { LocationMapItem } from "@/schemas/location-map";
import {
    areaFromPoints,
    fitView,
    moveTo,
    resizeFromCorner,
    rotationToward,
    toLocal,
    zoomAbout,
    type Point,
} from "@/components/location-map/geometry";

const box = (extra: Partial<LocationMapItem> = {}): LocationMapItem => ({
    id: "i", kind: "object", label: "", description: "", x: 5, y: 5, w: 4, h: 2, rotation: 0, ...extra,
});

function worldCorner(item: LocationMapItem, [cx, cy]: Point): Point {
    const r = (item.rotation * Math.PI) / 180;
    const [lx, ly] = [(cx * item.w) / 2, (cy * item.h) / 2];
    return [item.x + lx * Math.cos(r) - ly * Math.sin(r), item.y + lx * Math.sin(r) + ly * Math.cos(r)];
}

describe("location map geometry", () => {
    it("snaps a move to half metres unless placing freely", () => {
        expect(moveTo(box(), 3.3, 4.8, true)).toMatchObject({ x: 3.5, y: 5 });
        expect(moveTo(box(), 3.3, 4.8, false)).toMatchObject({ x: 3.3, y: 4.8 });
    });

    it("keeps the opposite corner fixed when resizing a rotated item", () => {
        const item = box({ rotation: 90 });
        const fixed = worldCorner(item, [-1, -1]);
        const resized = resizeFromCorner(item, [1, 1], [2, 11], false);
        const [fx, fy] = worldCorner(resized, [-1, -1]);
        expect(fx).toBeCloseTo(fixed[0]);
        expect(fy).toBeCloseTo(fixed[1]);
        expect(resized.w).toBeCloseTo(8);
        expect(resized.h).toBeCloseTo(4);
    });

    it("never resizes below the minimum, and scales an area's points with it", () => {
        const area = box({ kind: "area", points: [[-2, -1], [2, -1], [0, 1]] });
        const squashed = resizeFromCorner(area, [1, 1], [-10, -10], false);
        expect(squashed.w).toBe(0.1);
        expect(squashed.h).toBe(0.1);
        const doubled = resizeFromCorner(area, [1, 1], [11, 8], false);
        expect(doubled.points).toEqual([[-4, -2], [4, -2], [0, 2]]);
    });

    it("rotates toward the pointer, 0° straight up, snapped to 15°", () => {
        expect(rotationToward(box(), [10, 5], false)).toBeCloseTo(90);
        expect(rotationToward(box(), [5, 0], false)).toBeCloseTo(0);
        expect(rotationToward(box(), [0, 6], true)).toBe(255);
    });

    it("maps a point into an item's own frame", () => {
        const [lx, ly] = toLocal(box({ rotation: 90 }), [5, 7]);
        expect(lx).toBeCloseTo(2);
        expect(ly).toBeCloseTo(0);
    });

    it("turns drawn points into a box with centre-relative points", () => {
        expect(areaFromPoints([[1, 1], [5, 1], [3, 4]])).toEqual({
            x: 3, y: 2.5, w: 4, h: 3, points: [[-2, -1.5], [2, -1.5], [0, 1.5]],
        });
    });

    it("fits the map with a margin and zooms about a fixed point", () => {
        const view = fitView(10, 5, 1000, 1000);
        expect(view.k).toBe(90);
        expect(view.tx).toBe(50);
        const zoomed = zoomAbout(view, 180, [500, 500]);
        expect((500 - zoomed.tx) / zoomed.k).toBeCloseTo((500 - view.tx) / view.k);
        expect(zoomAbout(view, 1e6, [0, 0]).k).toBe(400);
    });
});
