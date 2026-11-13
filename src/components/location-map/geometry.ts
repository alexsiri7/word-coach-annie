import { normaliseRotation, type LocationMapItem } from "@/schemas/location-map";

/** Half the 1 m grid, so a 0.6 m chair still lands somewhere sensible. */
export const SNAP_M = 0.5;
export const SNAP_DEG = 15;
export const MIN_SIZE_M = 0.1;
export const MIN_ZOOM = 5;
export const MAX_ZOOM = 400;

export type Point = [number, number];
export type Corner = [-1 | 1, -1 | 1];

/** Pixels per metre, and where the map's top-left corner sits in the canvas. */
export interface View {
    k: number;
    tx: number;
    ty: number;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function snapTo(value: number, step: number, on: boolean): number {
    return on ? Math.round(value / step) * step : round(value);
}

function rotate([x, y]: Point, degrees: number): Point {
    const r = (degrees * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return [x * cos - y * sin, x * sin + y * cos];
}

/** A map point in the item's own frame: relative to its centre, rotation undone. */
export function toLocal(item: Pick<LocationMapItem, "x" | "y" | "rotation">, [px, py]: Point): Point {
    return rotate([px - item.x, py - item.y], -item.rotation);
}

export function moveTo(item: LocationMapItem, x: number, y: number, snap: boolean): LocationMapItem {
    return { ...item, x: snapTo(x, SNAP_M, snap), y: snapTo(y, SNAP_M, snap) };
}

/** Area points follow a change of size so the polygon keeps filling its box. */
export function resize(item: LocationMapItem, w: number, h: number): LocationMapItem {
    const sx = w / item.w;
    const sy = h / item.h;
    return {
        ...item,
        w,
        h,
        ...(item.points && { points: item.points.map(([px, py]) => [round(px * sx), round(py * sy)] as Point) }),
    };
}

/** Drags one corner to the pointer while the opposite corner stays where it is. */
export function resizeFromCorner(item: LocationMapItem, corner: Corner, pointer: Point, snap: boolean): LocationMapItem {
    const [cx, cy] = corner;
    const [ox, oy] = rotate([(-cx * item.w) / 2, (-cy * item.h) / 2], item.rotation);
    const fixed: Point = [item.x + ox, item.y + oy];
    const [dx, dy] = rotate([pointer[0] - fixed[0], pointer[1] - fixed[1]], -item.rotation);
    const size = (d: number) => Math.max(snap ? SNAP_M : MIN_SIZE_M, snapTo(d, SNAP_M, snap));
    const w = size(cx * dx);
    const h = size(cy * dy);
    const [hx, hy] = rotate([(cx * w) / 2, (cy * h) / 2], item.rotation);
    return { ...resize(item, w, h), x: round(fixed[0] + hx), y: round(fixed[1] + hy) };
}

/** The rotate handle sits above the item, so pointing straight up is 0°. */
export function rotationToward(item: Pick<LocationMapItem, "x" | "y">, [px, py]: Point, snap: boolean): number {
    const degrees = (Math.atan2(px - item.x, -(py - item.y)) * 180) / Math.PI;
    return normaliseRotation(snapTo(degrees, SNAP_DEG, snap));
}

/** An area from absolute map points: its bounding box, with the points made relative to its centre. */
export function areaFromPoints(points: Point[]): Pick<LocationMapItem, "x" | "y" | "w" | "h" | "points"> {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const x = round((minX + maxX) / 2);
    const y = round((minY + maxY) / 2);
    return {
        x,
        y,
        w: Math.max(MIN_SIZE_M, round(maxX - minX)),
        h: Math.max(MIN_SIZE_M, round(maxY - minY)),
        points: points.map(([px, py]) => [round(px - x), round(py - y)] as Point),
    };
}

export function clampZoom(k: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}

/** The whole map with a 5 % margin, centred in a canvas of the given size. */
export function fitView(widthM: number, heightM: number, canvasW: number, canvasH: number): View {
    const k = clampZoom(Math.min(canvasW / widthM, canvasH / heightM) * 0.9);
    return { k, tx: (canvasW - widthM * k) / 2, ty: (canvasH - heightM * k) / 2 };
}

/** Zooms so the map point under the canvas point (sx, sy) stays under it. */
export function zoomAbout(view: View, k: number, [sx, sy]: Point): View {
    const next = clampZoom(k);
    const scale = next / view.k;
    return { k: next, tx: sx - (sx - view.tx) * scale, ty: sy - (sy - view.ty) * scale };
}

export function toMap(view: View, [sx, sy]: Point): Point {
    return [(sx - view.tx) / view.k, (sy - view.ty) / view.k];
}
