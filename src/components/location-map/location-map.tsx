"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    DoorOpen,
    Magnet,
    MapPin,
    Maximize,
    Pentagon,
    Redo2,
    Square,
    Trash2,
    Undo2,
    User,
    ZoomIn,
    ZoomOut,
    type LucideIcon,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    LOCATION_MAP_LINK_TYPES,
    type LocationMapItem,
    type LocationMapItemKind,
    type LocationMapItemView,
    type LocationMapLinkType,
} from "@/schemas/location-map";
import { MapCanvas, type ItemLabel, type MapDoc } from "./map-canvas";
import { ItemPanel, KIND_LABELS, type LinkOption } from "./item-panel";
import { areaFromPoints, fitView, snapTo, SNAP_M, toMap, zoomAbout, type Point, type View } from "./geometry";
import { commit, redo, startHistory, undo, type History } from "./history";

const DEFAULT_SIZES: Record<Exclude<LocationMapItemKind, "area">, [number, number]> = {
    object: [1, 1],
    character: [0.6, 0.6],
    exit: [1, 0.3],
    note: [0.4, 0.4],
};

const KIND_ICONS: Record<LocationMapItemKind, LucideIcon> = { object: Square, character: User, exit: DoorOpen, area: Pentagon, note: MapPin };

const AUTOSAVE_MS = 800;
// Browsers refuse a keepalive request whose body is over 64 KiB.
const KEEPALIVE_MAX_BYTES = 64 * 1024;
const ZOOM_STEP = 1.25;

type ServerMap = Omit<MapDoc, "items"> & { items: LocationMapItemView[] };
type SaveState = "saved" | "unsaved" | "saving" | "failed";

const SAVE_LABELS: Record<SaveState, string> = {
    saved: "Saved",
    unsaved: "Unsaved changes",
    saving: "Saving…",
    failed: "Not saved",
};

async function errorMessage(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => null);
    return typeof body?.error === "string" ? body.error : fallback;
}

function linkOf(item: LocationMapItem): string | null {
    return item.storyObjectId ?? item.targetLocationId ?? null;
}

function withItem(doc: MapDoc, item: LocationMapItem): MapDoc {
    return { ...doc, items: doc.items.map((i) => (i.id === item.id ? item : i)) };
}

function toDoc(map: ServerMap): MapDoc {
    return {
        widthM: map.widthM,
        heightM: map.heightM,
        backgroundImageId: map.backgroundImageId,
        items: map.items.map(({ linkName: _linkName, unlinked: _unlinked, ...item }) => item),
    };
}

function SizeFields({ widthM, heightM, onCommit }: { widthM: number; heightM: number; onCommit: (w: number, h: number) => void }) {
    const field = (label: string, value: number, apply: (v: number) => void) => (
        <Input
            key={value}
            type="number"
            min={1}
            max={200}
            step="any"
            inputMode="decimal"
            aria-label={label}
            defaultValue={value}
            className="h-8 w-16 px-2 text-xs"
            onBlur={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next >= 1 && next <= 200 && next !== value) apply(next);
                else e.target.value = String(value);
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
            }}
        />
    );
    return (
        <span className="flex items-center gap-1 text-xs text-text-muted">
            {field("Map width in metres", widthM, (w) => onCommit(w, heightM))}
            ×
            {field("Map height in metres", heightM, (h) => onCommit(widthM, h))}
            m
        </span>
    );
}

interface LocationMapProps {
    storyObjectId: string;
    projectId: string;
    onOpenLocation: (storyObjectId: string) => void;
}

/** The Map tab of a location: a top-down sketch in metres, saved shortly after each change. */
export function LocationMap({ storyObjectId, projectId, onOpenLocation }: LocationMapProps) {
    const { error: toastError } = useToast();
    const url = `/api/story-objects/${storyObjectId}/map`;

    const [loaded, setLoaded] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [reloadToken, setReloadToken] = useState(0);
    const [history, setHistory] = useState<History<MapDoc> | null>(null);
    const [draft, setDraft] = useState<LocationMapItem | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [areaPoints, setAreaPoints] = useState<Point[] | null>(null);
    const [view, setView] = useState<View | null>(null);
    const [snap, setSnap] = useState(true);
    const [saveState, setSaveState] = useState<SaveState>("saved");
    const [serverNames, setServerNames] = useState<Map<string, string>>(new Map());
    const [linkOptions, setLinkOptions] = useState<Partial<Record<LocationMapLinkType, LinkOption[]>>>({});
    const [images, setImages] = useState<Array<{ id: string; caption: string }>>([]);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [newSize, setNewSize] = useState({ w: 12, h: 8 });

    const canvasSize = useRef<[number, number] | null>(null);
    // What the server holds, and the last map handed to save(): the same unless a save is pending.
    const saved = useRef<MapDoc | null>(null);
    const queued = useRef<MapDoc | null>(null);
    const autosave = useRef<ReturnType<typeof setTimeout>>(undefined);
    // Panel text typed but not yet blurred; select() and the unmount flush commit it if the field goes first.
    const typing = useRef<LocationMapItem | null>(null);
    const present = history?.present ?? null;
    const latest = useRef(present);
    latest.current = present;
    const saving = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        let cancelled = false;
        setLoadFailed(false);
        (async () => {
            const res = await fetch(url).catch(() => null);
            if (cancelled) return;
            if (!res?.ok) {
                toastError(res ? await errorMessage(res, "Could not load the map") : "Could not load the map");
                setLoadFailed(true);
                return;
            }
            const { data } = (await res.json()) as { data: ServerMap | null };
            if (cancelled) return;
            if (data) {
                const doc = toDoc(data);
                saved.current = doc;
                queued.current = doc;
                setHistory(startHistory(doc));
                setServerNames(new Map(data.items.flatMap((i) => (i.linkName ? [[linkOf(i)!, i.linkName] as const] : []))));
            }
            setLoaded(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [url, toastError, reloadToken]);

    useEffect(() => {
        let cancelled = false;
        for (const type of Object.values(LOCATION_MAP_LINK_TYPES)) {
            if (!type) continue;
            fetch(`/api/projects/${projectId}/story-objects?type=${type}&limit=200`)
                .then((res) => (res.ok ? res.json() : null))
                .then((body: { data: Array<{ id: string; name: string; source?: string }> } | null) => {
                    if (cancelled || !body) return;
                    const options = body.data
                        .filter((o) => (o.source ?? "project") === "project" && o.id !== storyObjectId)
                        .map(({ id, name }) => ({ id, name }));
                    setLinkOptions((prev) => ({ ...prev, [type]: options }));
                })
                .catch(() => {});
        }
        fetch(`/api/story-objects/${storyObjectId}/images`)
            .then((res) => (res.ok ? res.json() : null))
            .then((body) => {
                if (!cancelled && body) setImages(body.data);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [projectId, storyObjectId]);

    const put = useCallback((doc: MapDoc, keepalive = false) => {
        const body = JSON.stringify(doc);
        return fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: keepalive && new Blob([body]).size < KEEPALIVE_MAX_BYTES,
        });
    }, [url]);

    // One save at a time, in order, so an older map never lands after a newer one.
    const save = useCallback((doc: MapDoc, keepalive = false) => {
        queued.current = doc;
        saving.current = saving.current.then(async () => {
            setSaveState("saving");
            const res = await put(doc, keepalive).catch(() => null);
            if (res?.ok) {
                saved.current = doc;
                setSaveState(latest.current === doc ? "saved" : "unsaved");
            } else {
                if (queued.current === doc) queued.current = saved.current;
                setSaveState("failed");
                toastError(res ? await errorMessage(res, "Could not save the map") : "Could not save the map");
            }
        });
    }, [put, toastError]);

    useEffect(() => {
        if (!present) return;
        if (present === queued.current) {
            if (present === saved.current) setSaveState("saved");
            return;
        }
        setSaveState("unsaved");
        const timer = setTimeout(() => save(present), AUTOSAVE_MS);
        autosave.current = timer;
        return () => clearTimeout(timer);
    }, [present, save]);

    // Leaving the tab mid-debounce or mid-typing must not lose the last change.
    useEffect(() => () => {
        const doc = latest.current && typing.current ? withItem(latest.current, typing.current) : latest.current;
        if (doc && doc !== queued.current) save(doc, true);
    }, [save]);

    const fit = useCallback(() => {
        const doc = latest.current;
        if (doc && canvasSize.current) setView(fitView(doc.widthM, doc.heightM, ...canvasSize.current));
    }, []);

    const onResize = useCallback((width: number, height: number) => {
        canvasSize.current = [width, height];
        fit();
    }, [fit]);

    const widthM = present?.widthM;
    const heightM = present?.heightM;
    useEffect(() => {
        fit();
    }, [widthM, heightM, fit]);

    const change = useCallback((next: (doc: MapDoc) => MapDoc) => {
        setDraft(null);
        setHistory((h) => (h ? commit(h, next(h.present)) : h));
    }, []);

    const replaceItem = useCallback((item: LocationMapItem) => {
        change((doc) => withItem(doc, item));
    }, [change]);

    // Selecting on pointerdown unmounts the panel's fields before they blur.
    const select = useCallback((id: string | null) => {
        const item = typing.current;
        typing.current = null;
        if (item) replaceItem(item);
        setSelectedId(id);
    }, [replaceItem]);

    const deleteItem = useCallback((id: string) => {
        change((doc) => ({ ...doc, items: doc.items.filter((i) => i.id !== id) }));
        setSelectedId(null);
    }, [change]);

    const names = useMemo(() => {
        const all = new Map(serverNames);
        for (const options of Object.values(linkOptions)) for (const o of options) all.set(o.id, o.name);
        return all;
    }, [serverNames, linkOptions]);

    const labelOf = useCallback((item: LocationMapItem): ItemLabel => {
        const link = linkOf(item);
        if (link === null) return { text: item.label, unlinked: false };
        const name = names.get(link);
        return name ? { text: name, unlinked: false } : { text: item.label, unlinked: true };
    }, [names]);

    const openExit = useCallback((item: LocationMapItem) => {
        if (item.targetLocationId && names.has(item.targetLocationId)) onOpenLocation(item.targetLocationId);
    }, [names, onOpenLocation]);

    const closeArea = useCallback(() => {
        if (areaPoints && areaPoints.length >= 3) {
            const id = crypto.randomUUID();
            const area: LocationMapItem = { id, kind: "area", label: "Area", description: "", rotation: 0, ...areaFromPoints(areaPoints) };
            change((doc) => ({ ...doc, items: [...doc.items, area] }));
            select(id);
        }
        setAreaPoints(null);
    }, [areaPoints, change, select]);

    const addItem = (kind: LocationMapItemKind) => {
        if (!present) return;
        if (kind === "area") {
            select(null);
            setAreaPoints([]);
            return;
        }
        const [w, h] = DEFAULT_SIZES[kind];
        const [cx, cy] = view && canvasSize.current
            ? toMap(view, [canvasSize.current[0] / 2, canvasSize.current[1] / 2])
            : [present.widthM / 2, present.heightM / 2];
        const inside = (v: number, max: number) => Math.min(max, Math.max(0, snapTo(v, SNAP_M, true)));
        const item: LocationMapItem = {
            id: crypto.randomUUID(),
            kind,
            label: KIND_LABELS[kind],
            description: "",
            x: inside(cx, present.widthM),
            y: inside(cy, present.heightM),
            w,
            h,
            rotation: 0,
        };
        change((doc) => ({ ...doc, items: [...doc.items, item] }));
        select(item.id);
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='listbox']")) return;
            const mod = e.metaKey || e.ctrlKey;
            const key = e.key.toLowerCase();
            if (mod && (key === "z" || key === "y")) {
                e.preventDefault();
                setDraft(null);
                setHistory((h) => (h ? (key === "y" || e.shiftKey ? redo(h) : undo(h)) : h));
            } else if (e.key === "Escape") {
                if (areaPoints) setAreaPoints(null);
                else setSelectedId(null);
            } else if (e.key === "Enter" && areaPoints) {
                closeArea();
            } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !areaPoints) {
                e.preventDefault();
                deleteItem(selectedId);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [areaPoints, closeArea, deleteItem, selectedId]);

    const createMap = async () => {
        const doc: MapDoc = { widthM: newSize.w, heightM: newSize.h, backgroundImageId: null, items: [] };
        const res = await put(doc).catch(() => null);
        if (!res?.ok) {
            toastError(res ? await errorMessage(res, "Could not create the map") : "Could not create the map");
            return;
        }
        saved.current = doc;
        queued.current = doc;
        setSaveState("saved");
        setHistory(startHistory(doc));
    };

    const deleteMap = async () => {
        setDeleteOpen(false);
        clearTimeout(autosave.current);
        await saving.current;
        const res = await fetch(url, { method: "DELETE" }).catch(() => null);
        if (!res?.ok) {
            toastError(res ? await errorMessage(res, "Could not delete the map") : "Could not delete the map");
            if (latest.current && latest.current !== queued.current) save(latest.current);
            return;
        }
        saved.current = null;
        queued.current = null;
        latest.current = null;
        setHistory(null);
        setSelectedId(null);
        setAreaPoints(null);
        setView(null);
    };

    if (loadFailed) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 h-full p-8 text-center">
                <p className="text-sm text-text-muted">Could not load the map.</p>
                <Button size="sm" onClick={() => setReloadToken((t) => t + 1)}>Retry</Button>
            </div>
        );
    }

    if (!loaded) {
        return (
            <div className="flex items-center justify-center h-full text-text-muted">
                <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!history || !present) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 h-full p-8 text-center">
                <p className="text-sm text-text-muted">This location has no map yet. Sketch a rough top-down layout, in metres.</p>
                <SizeFields widthM={newSize.w} heightM={newSize.h} onCommit={(w, h) => setNewSize({ w, h })} />
                <Button size="sm" onClick={createMap}>Create map</Button>
            </div>
        );
    }

    const shown = draft ? { ...present, items: present.items.map((i) => (i.id === draft.id ? draft : i)) } : present;
    const selected = shown.items.find((i) => i.id === selectedId) ?? null;
    const linkType = selected ? LOCATION_MAP_LINK_TYPES[selected.kind] : null;
    const selectedLink = selected ? linkOf(selected) : null;
    const canvasCentre: Point = canvasSize.current ? [canvasSize.current[0] / 2, canvasSize.current[1] / 2] : [0, 0];

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-border" role="toolbar" aria-label="Map tools">
                {(Object.keys(KIND_ICONS) as LocationMapItemKind[]).map((kind) => {
                    const Icon = KIND_ICONS[kind];
                    return (
                        <Button
                            key={kind}
                            variant={kind === "area" && areaPoints ? "default" : "outline"}
                            size="sm"
                            className="h-8 gap-1 px-2"
                            onClick={() => addItem(kind)}
                            aria-label={`Add ${KIND_LABELS[kind].toLowerCase()}`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            <span className="hidden lg:inline">{KIND_LABELS[kind]}</span>
                        </Button>
                    );
                })}
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setHistory(undo(history))} disabled={history.past.length === 0} aria-label="Undo">
                    <Undo2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setHistory(redo(history))} disabled={history.future.length === 0} aria-label="Redo">
                    <Redo2 className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8", snap && "text-accent")}
                    onClick={() => setSnap((s) => !s)}
                    aria-pressed={snap}
                    aria-label="Snap to grid"
                    title="Snap to grid (hold Alt to place freely)"
                >
                    <Magnet className="h-4 w-4" />
                </Button>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => view && setView(zoomAbout(view, view.k / ZOOM_STEP, canvasCentre))} aria-label="Zoom out">
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => view && setView(zoomAbout(view, view.k * ZOOM_STEP, canvasCentre))} aria-label="Zoom in">
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fit} aria-label="Fit map">
                    <Maximize className="h-4 w-4" />
                </Button>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                <SizeFields
                    widthM={present.widthM}
                    heightM={present.heightM}
                    onCommit={(w, h) => change((doc) => ({ ...doc, widthM: w, heightM: h }))}
                />
                {images.length > 0 && (
                    <Select
                        value={present.backgroundImageId ?? "none"}
                        onValueChange={(id) => change((doc) => ({ ...doc, backgroundImageId: id === "none" ? null : id }))}
                    >
                        <SelectTrigger className="h-8 w-36 text-xs" aria-label="Background image">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">No background</SelectItem>
                            {images.map((image, i) => (
                                <SelectItem key={image.id} value={image.id}>{image.caption || `Image ${i + 1}`}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                <span className="ml-auto flex items-center gap-1">
                    <span className={cn("text-xs", saveState === "failed" ? "text-danger" : "text-text-muted")} role="status">
                        {SAVE_LABELS[saveState]}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-text-muted hover:text-danger"
                        onClick={() => setDeleteOpen(true)}
                        aria-label="Delete map"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </span>
            </div>

            {areaPoints && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs bg-accent/10 text-text-secondary">
                    <span>Tap to place corners; tap the first corner, double-tap or press Done to finish.</span>
                    <span className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => setAreaPoints(null)}>Cancel</Button>
                        <Button size="sm" className="h-7" onClick={closeArea} disabled={areaPoints.length < 3}>Done</Button>
                    </span>
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row">
                <div className="relative h-[60vh] flex-shrink-0 md:h-auto md:flex-1 md:min-h-0">
                    <MapCanvas
                        map={shown}
                        view={view}
                        onViewChange={setView}
                        onResize={onResize}
                        selectedId={selectedId}
                        onSelect={select}
                        labelOf={labelOf}
                        backgroundUrl={present.backgroundImageId ? `/api/location-images/${present.backgroundImageId}/file?variant=full` : null}
                        snap={snap}
                        areaPoints={areaPoints}
                        onAreaPoint={(p) => setAreaPoints((points) => (points ? [...points, p] : points))}
                        onAreaClose={closeArea}
                        onPreview={setDraft}
                        onCommit={replaceItem}
                        onOpenExit={openExit}
                    />
                </div>
                <aside className="md:w-72 md:flex-shrink-0 md:overflow-y-auto border-t md:border-t-0 md:border-l border-border p-4">
                    {selected ? (
                        <ItemPanel
                            item={selected}
                            linkOptions={linkType ? linkOptions[linkType] ?? [] : undefined}
                            linkName={selectedLink ? names.get(selectedLink) ?? null : null}
                            onChange={replaceItem}
                            onTyping={(item) => {
                                typing.current = item;
                            }}
                            onDelete={() => deleteItem(selected.id)}
                            onOpenExit={openExit}
                        />
                    ) : (
                        <p className="text-xs text-text-muted">
                            Add objects, characters, exits, areas and notes from the toolbar. Drag to move; use the corner handles to resize and the top handle to rotate. Double-click an exit to open the map it leads to.
                        </p>
                    )}
                </aside>
            </div>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this map?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently deletes the map and everything placed on it. The location itself is kept.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={deleteMap} className="bg-danger hover:bg-danger-hover">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
