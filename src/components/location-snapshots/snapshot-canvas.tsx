"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { SnapshotRegion, SnapshotThing } from "@/schemas/location-snapshots";

export type CanvasTool = "select" | "pin" | "rect" | "path";

export interface CanvasNote {
    id: string;
    number: number;
    region: SnapshotRegion;
}

interface SnapshotCanvasProps {
    imageUrl: string;
    width: number;
    height: number;
    things: SnapshotThing[];
    notes: CanvasNote[];
    /** Things with a name or description change that the game does not show yet. */
    pendingKeys: ReadonlySet<string>;
    selectedKey: string | null;
    tool: CanvasTool;
    draft: SnapshotRegion | null;
    onSelectThing: (key: string) => void;
    onDraw: (region: SnapshotRegion) => void;
}

/** In snapshot pixels: smaller drags are taken as slips, and freehand drops points closer than this. */
const MIN_STROKE = 4;
const MAX_PATH_POINTS = 1000;

/** Where a region's number badge sits, as a fraction of the image. */
function anchor(region: SnapshotRegion, width: number, height: number): { left: number; top: number } {
    const [x, y] = region.type === "path" ? region.points[0] : [region.x, region.y];
    return { left: x / width, top: y / height };
}

function RegionShape({ region, radius, className }: { region: SnapshotRegion; radius: number; className: string }) {
    const common = { className, fill: "none", strokeWidth: 2, vectorEffect: "non-scaling-stroke" } as const;
    if (region.type === "point") return <circle cx={region.x} cy={region.y} r={radius} {...common} />;
    if (region.type === "rect") return <rect x={region.x} y={region.y} width={region.w} height={region.h} {...common} />;
    return <polyline points={region.points.map((p) => p.join(",")).join(" ")} strokeLinejoin="round" {...common} />;
}

/**
 * A snapshot with its things outlined and its notes drawn over it. The overlay's
 * viewBox is the uploaded screenshot's pixel space, the space of thing boxes and
 * regions, stretched over the (possibly downscaled) image.
 */
export function SnapshotCanvas({
    imageUrl,
    width,
    height,
    things,
    notes,
    pendingKeys,
    selectedKey,
    tool,
    draft,
    onSelectThing,
    onDraw,
}: SnapshotCanvasProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [drawing, setDrawing] = useState<SnapshotRegion | null>(null);
    const [hoverKey, setHoverKey] = useState<string | null>(null);
    const origin = useRef<[number, number] | null>(null);
    const radius = Math.max(width, height) / 60;

    const toSnapshotPoint = (e: React.PointerEvent): [number, number] => {
        const ctm = svgRef.current!.getScreenCTM()!.inverse();
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm);
        return [Math.min(Math.max(p.x, 0), width), Math.min(Math.max(p.y, 0), height)];
    };

    const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
        if (tool === "select") return;
        e.preventDefault();
        const [x, y] = toSnapshotPoint(e);
        if (tool === "pin") {
            onDraw({ type: "point", x, y });
            return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        origin.current = [x, y];
        setDrawing(tool === "rect" ? { type: "rect", x, y, w: 0, h: 0 } : { type: "path", points: [[x, y]] });
    };

    const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        if (!drawing || !origin.current) return;
        const [x, y] = toSnapshotPoint(e);
        if (drawing.type === "rect") {
            const [x0, y0] = origin.current;
            setDrawing({ type: "rect", x: Math.min(x0, x), y: Math.min(y0, y), w: Math.abs(x - x0), h: Math.abs(y - y0) });
        } else if (drawing.type === "path" && drawing.points.length < MAX_PATH_POINTS) {
            const [lx, ly] = drawing.points[drawing.points.length - 1];
            if (Math.hypot(x - lx, y - ly) >= MIN_STROKE) setDrawing({ type: "path", points: [...drawing.points, [x, y]] });
        }
    };

    const onPointerUp = () => {
        const done = drawing;
        setDrawing(null);
        origin.current = null;
        if (!done) return;
        if (done.type === "rect" && (done.w < MIN_STROKE || done.h < MIN_STROKE)) return;
        if (done.type === "path" && done.points.length < 2) return;
        onDraw(done);
    };

    const labelled = things.find((t) => t.key === (hoverKey ?? selectedKey));

    return (
        <div className="relative select-none">
            <img src={imageUrl} alt="Game snapshot" className="block w-full h-auto rounded-sm" draggable={false} />
            <svg
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                className={cn("absolute inset-0 h-full w-full", tool === "select" ? "cursor-default" : "cursor-crosshair touch-none")}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                aria-label="Snapshot overlay"
            >
                <g pointerEvents={tool === "select" ? "all" : "none"}>
                    {things.map((thing) => (
                        <g
                            key={thing.key}
                            role="button"
                            tabIndex={0}
                            aria-label={thing.name || thing.key}
                            aria-pressed={selectedKey === thing.key}
                            className="cursor-pointer focus:outline-none"
                            onClick={() => onSelectThing(thing.key)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onSelectThing(thing.key);
                                }
                            }}
                            onPointerEnter={() => setHoverKey(thing.key)}
                            onPointerLeave={() => setHoverKey(null)}
                            onFocus={() => setHoverKey(thing.key)}
                            onBlur={() => setHoverKey(null)}
                        >
                            <title>{thing.name || thing.key}</title>
                            <rect
                                x={thing.box.x}
                                y={thing.box.y}
                                width={thing.box.w}
                                height={thing.box.h}
                                fill="transparent"
                                strokeWidth={selectedKey === thing.key ? 3 : 2}
                                vectorEffect="non-scaling-stroke"
                                strokeDasharray={pendingKeys.has(thing.key) ? "6 4" : undefined}
                                className={pendingKeys.has(thing.key) ? "stroke-warning" : "stroke-accent"}
                            />
                        </g>
                    ))}
                </g>
                <g pointerEvents="none">
                    {notes.map((note) => (
                        <RegionShape key={note.id} region={note.region} radius={radius} className="stroke-danger" />
                    ))}
                    {(drawing ?? draft) && (
                        <RegionShape region={(drawing ?? draft)!} radius={radius} className="stroke-danger opacity-70" />
                    )}
                </g>
            </svg>
            {notes.map((note) => {
                const { left, top } = anchor(note.region, width, height);
                return (
                    <span
                        key={note.id}
                        aria-hidden
                        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white shadow"
                        style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
                    >
                        {note.number}
                    </span>
                );
            })}
            {labelled && (
                <span
                    className="pointer-events-none absolute -translate-y-full rounded-sm bg-surface-raised/95 px-1.5 py-0.5 text-xs font-medium text-text-primary shadow"
                    style={{ left: `${(labelled.box.x / width) * 100}%`, top: `${(labelled.box.y / height) * 100}%` }}
                >
                    {labelled.name || labelled.key}
                </span>
            )}
        </div>
    );
}
