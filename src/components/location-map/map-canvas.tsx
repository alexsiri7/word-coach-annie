"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { LocationMapItem } from "@/schemas/location-map";
import {
    moveTo,
    resizeFromCorner,
    rotationToward,
    snapTo,
    SNAP_M,
    toMap,
    zoomAbout,
    type Corner,
    type Point,
    type View,
} from "./geometry";

export interface MapDoc {
    widthM: number;
    heightM: number;
    backgroundImageId: string | null;
    items: LocationMapItem[];
}

export interface ItemLabel {
    text: string;
    unlinked: boolean;
}

interface MapCanvasProps {
    map: MapDoc;
    view: View | null;
    onViewChange: (view: View) => void;
    onResize: (width: number, height: number) => void;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    labelOf: (item: LocationMapItem) => ItemLabel;
    backgroundUrl: string | null;
    snap: boolean;
    /** The vertices placed so far while drawing an area, or null when not drawing. */
    areaPoints: Point[] | null;
    onAreaPoint: (point: Point) => void;
    onAreaClose: () => void;
    onPreview: (item: LocationMapItem | null) => void;
    onCommit: (item: LocationMapItem) => void;
    onOpenExit: (item: LocationMapItem) => void;
}

type ItemGesture = { pointerId: number; origin: LocationMapItem; moved: boolean; latest: LocationMapItem | null };

type Gesture =
    | (ItemGesture & { type: "move"; start: Point; startScreen: Point })
    | (ItemGesture & { type: "resize"; corner: Corner })
    | (ItemGesture & { type: "rotate" })
    | { type: "pan"; pointerId: number; start: Point; view: View; moved: boolean }
    | { type: "pinch"; distance: number; midpoint: Point; view: View };

/** Movement under this many pixels is a tap, not a drag. */
const TAP_SLOP_PX = 4;
const DOUBLE_TAP_MS = 400;
/** Placing a vertex this close to the first one, or to the last one, closes the area. */
const CLOSE_AREA_PX = 12;
const HANDLE_PX = 7;
const HANDLE_HIT_PX = 16;
const ROTATE_STEM_PX = 26;
const LABEL_PX = 12;

const CORNERS: Corner[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

const distance = ([ax, ay]: Point, [bx, by]: Point) => Math.hypot(ax - bx, ay - by);
const midpointOf = ([ax, ay]: Point, [bx, by]: Point): Point => [(ax + bx) / 2, (ay + by) / 2];

const SHAPE_CLASSES: Record<LocationMapItem["kind"], string> = {
    object: "fill-accent/15 stroke-accent",
    character: "fill-accent/35 stroke-accent",
    exit: "fill-surface-raised stroke-text-primary",
    area: "fill-accent/10 stroke-accent/60",
    note: "fill-text-muted/40 stroke-text-muted",
};

function Shape({ item, unlinked, selected, k }: { item: LocationMapItem; unlinked: boolean; selected: boolean; k: number }) {
    const common = {
        className: cn(SHAPE_CLASSES[item.kind], unlinked && "stroke-danger"),
        strokeWidth: selected ? 2.5 : 1.25,
        strokeDasharray: unlinked ? "4 3" : undefined,
        vectorEffect: "non-scaling-stroke" as const,
    };
    const { w, h } = item;
    switch (item.kind) {
        case "character":
            return <ellipse rx={w / 2} ry={h / 2} {...common} />;
        case "area":
            return <polygon points={(item.points ?? []).map((p) => p.join(",")).join(" ")} {...common} />;
        case "note": {
            const r = Math.max(Math.min(w, h) / 2, 6 / k);
            return (
                <>
                    <circle r={r} {...common} />
                    <circle r={r / 3} className="fill-text-muted" />
                </>
            );
        }
        case "exit": {
            const s = Math.min(w, h) * 0.35;
            return (
                <>
                    <rect x={-w / 2} y={-h / 2} width={w} height={h} {...common} />
                    <path
                        d={`M ${-s} ${s / 2} L 0 ${-s / 2} L ${s} ${s / 2}`}
                        fill="none"
                        className="stroke-text-primary"
                        strokeWidth={1.25}
                        vectorEffect="non-scaling-stroke"
                    />
                </>
            );
        }
        default:
            return <rect x={-w / 2} y={-h / 2} width={w} height={h} {...common} />;
    }
}

/** Drawn in canvas pixels: Chrome garbles text whose font size is a fraction of a unit under a large scale. */
function Label({ item, label, view }: { item: LocationMapItem; label: ItemLabel; view: View }) {
    if (!label.text && !label.unlinked) return null;
    const { k, tx, ty } = view;
    const beside = item.kind === "note";
    const below = item.kind === "character";
    const x = beside ? item.x + Math.max(item.w / 2, 6 / k) : item.x;
    const y = below ? item.y + item.h / 2 : item.y;
    return (
        <text
            x={tx + x * k + (beside ? 4 : 0)}
            y={ty + y * k + (below ? LABEL_PX : 0)}
            fontSize={LABEL_PX}
            textAnchor={beside ? "start" : "middle"}
            dominantBaseline="middle"
            className="fill-text-primary stroke-surface"
            strokeWidth={3}
            strokeLinejoin="round"
            paintOrder="stroke"
            pointerEvents="none"
        >
            {label.text}
            {label.unlinked && <tspan className="fill-danger"> (unlinked)</tspan>}
        </text>
    );
}

function Handles({ item, k }: { item: LocationMapItem; k: number }) {
    const r = HANDLE_PX / k;
    const hit = HANDLE_HIT_PX / k;
    const stemTop = -item.h / 2 - ROTATE_STEM_PX / k;
    return (
        <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
            <line
                x1={0}
                y1={-item.h / 2}
                x2={0}
                y2={stemTop}
                className="stroke-accent"
                strokeWidth={1.25}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
            />
            <g data-handle="rotate" className="cursor-grab">
                <circle cy={stemTop} r={hit} fill="transparent" />
                <circle cy={stemTop} r={r} className="fill-surface stroke-accent" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </g>
            {CORNERS.map(([cx, cy]) => (
                <g key={`${cx}${cy}`} data-handle={`${cx},${cy}`} className={cx === cy ? "cursor-nwse-resize" : "cursor-nesw-resize"}>
                    <circle cx={(cx * item.w) / 2} cy={(cy * item.h) / 2} r={hit} fill="transparent" />
                    <rect
                        x={(cx * item.w) / 2 - r}
                        y={(cy * item.h) / 2 - r}
                        width={2 * r}
                        height={2 * r}
                        className="fill-surface stroke-accent"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                    />
                </g>
            ))}
        </g>
    );
}

function gridPath(widthM: number, heightM: number): string {
    const lines: string[] = [];
    for (let x = 1; x < widthM; x++) lines.push(`M ${x} 0 V ${heightM}`);
    for (let y = 1; y < heightM; y++) lines.push(`M 0 ${y} H ${widthM}`);
    return lines.join(" ");
}

/** The map drawn in metres on one SVG; Pointer Events give mouse, pen and touch one code path. */
export function MapCanvas({
    map,
    view,
    onViewChange,
    onResize,
    selectedId,
    onSelect,
    labelOf,
    backgroundUrl,
    snap,
    areaPoints,
    onAreaPoint,
    onAreaClose,
    onPreview,
    onCommit,
    onOpenExit,
}: MapCanvasProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const pointers = useRef(new Map<number, Point>());
    const gesture = useRef<Gesture | null>(null);
    const lastTap = useRef<{ id: string; time: number } | null>(null);
    const viewRef = useRef(view);
    viewRef.current = view;

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const observer = new ResizeObserver(([entry]) => onResize(entry.contentRect.width, entry.contentRect.height));
        observer.observe(svg);
        return () => observer.disconnect();
    }, [onResize]);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        // React's wheel listener is passive, and the page must not scroll while zooming.
        const onWheel = (e: WheelEvent) => {
            const current = viewRef.current;
            if (!current) return;
            e.preventDefault();
            const rect = svg.getBoundingClientRect();
            onViewChange(zoomAbout(current, current.k * Math.exp(-e.deltaY * 0.0015), [e.clientX - rect.left, e.clientY - rect.top]));
        };
        svg.addEventListener("wheel", onWheel, { passive: false });
        return () => svg.removeEventListener("wheel", onWheel);
    }, [onViewChange]);

    const screenPoint = (e: ReactPointerEvent): Point => {
        const rect = svgRef.current!.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    };

    const cancelItemGesture = () => {
        const g = gesture.current;
        if (g && (g.type === "move" || g.type === "resize" || g.type === "rotate")) onPreview(null);
        gesture.current = null;
    };

    const placeAreaPoint = (screen: Point, free: boolean) => {
        if (!view || !areaPoints) return;
        const near = (p: Point) => distance(screen, [p[0] * view.k + view.tx, p[1] * view.k + view.ty]) < CLOSE_AREA_PX;
        if (areaPoints.length >= 3 && (near(areaPoints[0]) || near(areaPoints[areaPoints.length - 1]))) {
            onAreaClose();
            return;
        }
        const [x, y] = toMap(view, screen);
        const on = snap && !free;
        onAreaPoint([snapTo(x, SNAP_M, on), snapTo(y, SNAP_M, on)]);
    };

    const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
        if (!view || (e.pointerType === "mouse" && e.button !== 0)) return;
        const screen = screenPoint(e);
        pointers.current.set(e.pointerId, screen);
        svgRef.current?.setPointerCapture(e.pointerId);

        if (pointers.current.size === 2) {
            cancelItemGesture();
            const [a, b] = [...pointers.current.values()];
            gesture.current = { type: "pinch", distance: Math.max(distance(a, b), 1), midpoint: midpointOf(a, b), view };
            return;
        }
        if (pointers.current.size > 2) return;

        if (areaPoints) {
            placeAreaPoint(screen, e.altKey);
            return;
        }

        const target = e.target as Element;
        const handle = target.closest("[data-handle]")?.getAttribute("data-handle");
        const selected = map.items.find((i) => i.id === selectedId);
        if (handle && selected) {
            const base = { pointerId: e.pointerId, origin: selected, moved: false, latest: null };
            gesture.current = handle === "rotate"
                ? { ...base, type: "rotate" }
                : { ...base, type: "resize", corner: handle.split(",").map(Number) as Corner };
            return;
        }

        const itemId = target.closest("[data-item-id]")?.getAttribute("data-item-id");
        const item = itemId ? map.items.find((i) => i.id === itemId) : undefined;
        if (item) {
            onSelect(item.id);
            gesture.current = {
                type: "move",
                pointerId: e.pointerId,
                origin: item,
                start: toMap(view, screen),
                startScreen: screen,
                moved: false,
                latest: null,
            };
            return;
        }
        gesture.current = { type: "pan", pointerId: e.pointerId, start: screen, view, moved: false };
    };

    const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
        if (!pointers.current.has(e.pointerId) || !view) return;
        const screen = screenPoint(e);
        pointers.current.set(e.pointerId, screen);
        const g = gesture.current;
        if (!g) return;
        const snapOn = snap && !e.altKey;

        if (g.type === "pinch") {
            const [a, b] = [...pointers.current.values()];
            const mid = midpointOf(a, b);
            const [mx, my] = toMap(g.view, g.midpoint);
            const zoomed = zoomAbout(g.view, (g.view.k * distance(a, b)) / g.distance, g.midpoint);
            onViewChange({ k: zoomed.k, tx: mid[0] - mx * zoomed.k, ty: mid[1] - my * zoomed.k });
            return;
        }
        if (g.pointerId !== e.pointerId) return;

        if (g.type === "pan") {
            if (distance(screen, g.start) > TAP_SLOP_PX) g.moved = true;
            if (g.moved) onViewChange({ ...g.view, tx: g.view.tx + screen[0] - g.start[0], ty: g.view.ty + screen[1] - g.start[1] });
            return;
        }

        const pointer = toMap(view, screen);
        if (g.type === "move") {
            if (!g.moved && distance(screen, g.startScreen) <= TAP_SLOP_PX) return;
            g.moved = true;
            g.latest = moveTo(g.origin, g.origin.x + pointer[0] - g.start[0], g.origin.y + pointer[1] - g.start[1], snapOn);
        } else if (g.type === "resize") {
            g.moved = true;
            g.latest = resizeFromCorner(g.origin, g.corner, pointer, snapOn);
        } else {
            g.moved = true;
            g.latest = { ...g.origin, rotation: rotationToward(g.origin, pointer, snapOn) };
        }
        onPreview(g.latest);
    };

    const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
        if (!pointers.current.delete(e.pointerId)) return;
        const g = gesture.current;
        if (!g) return;
        if (g.type === "pinch") {
            if (pointers.current.size < 2) gesture.current = null;
            return;
        }
        if (g.pointerId !== e.pointerId) return;
        gesture.current = null;

        if (e.type === "pointercancel") {
            if (g.type !== "pan") onPreview(null);
            return;
        }
        if (g.type === "pan") {
            if (!g.moved) onSelect(null);
            return;
        }
        if (g.moved && g.latest) {
            onCommit(g.latest);
            return;
        }
        onPreview(null);
        if (g.type === "move") {
            const now = e.timeStamp;
            const previous = lastTap.current;
            lastTap.current = { id: g.origin.id, time: now };
            if (previous?.id === g.origin.id && now - previous.time < DOUBLE_TAP_MS && g.origin.kind === "exit") {
                lastTap.current = null;
                onOpenExit(g.origin);
            }
        }
    };

    const ordered = [...map.items.filter((i) => i.kind === "area"), ...map.items.filter((i) => i.kind !== "area")];
    const selected = map.items.find((i) => i.id === selectedId);

    return (
        <svg
            ref={svgRef}
            className={cn("block h-full w-full touch-none select-none bg-surface-sunken", areaPoints && "cursor-crosshair")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="application"
            aria-label="Location map canvas"
            data-testid="location-map-canvas"
        >
            {view && (
                <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
                    <rect width={map.widthM} height={map.heightM} className="fill-surface" />
                    {backgroundUrl && (
                        <image
                            href={backgroundUrl}
                            width={map.widthM}
                            height={map.heightM}
                            preserveAspectRatio="xMidYMid meet"
                            opacity={0.55}
                            pointerEvents="none"
                        />
                    )}
                    <path d={gridPath(map.widthM, map.heightM)} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
                    <rect
                        width={map.widthM}
                        height={map.heightM}
                        fill="none"
                        className="stroke-text-muted"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                    />
                    {ordered.map((item) => (
                        <g
                            key={item.id}
                            data-item-id={item.id}
                            transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}
                            className="cursor-move"
                        >
                            <Shape item={item} unlinked={labelOf(item).unlinked} selected={item.id === selectedId} k={view.k} />
                        </g>
                    ))}
                    {selected && !areaPoints && <Handles item={selected} k={view.k} />}
                    {areaPoints && areaPoints.length > 0 && (
                        <g pointerEvents="none">
                            <polyline
                                points={areaPoints.map((p) => p.join(",")).join(" ")}
                                fill="none"
                                className="stroke-accent"
                                strokeWidth={1.5}
                                strokeDasharray="5 4"
                                vectorEffect="non-scaling-stroke"
                            />
                            {areaPoints.map(([x, y], i) => (
                                <circle key={i} cx={x} cy={y} r={(i === 0 ? 6 : 4) / view.k} className="fill-accent" />
                            ))}
                        </g>
                    )}
                </g>
            )}
            {view && (
                <g>
                    {ordered.map((item) => (
                        <Label key={item.id} item={item} label={labelOf(item)} view={view} />
                    ))}
                </g>
            )}
        </svg>
    );
}
