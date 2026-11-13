"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, MapPin, MousePointer2, PenLine, Square, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { errorMessage } from "@/components/location-images";
import { SnapshotCanvas, type CanvasNote, type CanvasTool } from "@/components/location-snapshots/snapshot-canvas";
import type {
    SnapshotAnnotationKind,
    SnapshotAnnotationStatus,
    SnapshotRegion,
    SnapshotThing,
} from "@/schemas/location-snapshots";

interface SnapshotSummary {
    id: string;
    build: string;
    takenAt: string;
    width: number;
    height: number;
    thingCount: number;
}

interface Snapshot extends SnapshotSummary {
    things: SnapshotThing[];
    imageUrl: string;
}

interface Annotation {
    id: string;
    snapshotId: string | null;
    kind: SnapshotAnnotationKind;
    thingKey: string | null;
    region: SnapshotRegion | null;
    text: string;
    storyObjectId: string | null;
    status: SnapshotAnnotationStatus;
}

type ThingField = "name" | "description";

const STATUS_LABELS: Record<SnapshotAnnotationStatus, string> = {
    open: "Open",
    sent: "Sent",
    done: "Done",
};

const TOOLS: { tool: CanvasTool; label: string; Icon: typeof MousePointer2 }[] = [
    { tool: "select", label: "Select a thing", Icon: MousePointer2 },
    { tool: "pin", label: "Pin a point", Icon: MapPin },
    { tool: "rect", label: "Draw a rectangle", Icon: Square },
    { tool: "path", label: "Draw freehand", Icon: PenLine },
];

const NO_LINK = "__none";

const isPending = (a: Annotation) => a.kind !== "note" && a.status !== "done";

/** The game's snapshots of a location, with notes on regions and requested changes to its things. */
export function LocationSnapshots({ storyObjectId, projectId }: { storyObjectId: string; projectId: string }) {
    const { error: toastError } = useToast();
    const [summaries, setSummaries] = useState<SnapshotSummary[] | null>(null);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [index, setIndex] = useState(0);
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [tool, setTool] = useState<CanvasTool>("select");
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [edit, setEdit] = useState<Record<ThingField, string>>({ name: "", description: "" });
    const [draft, setDraft] = useState<SnapshotRegion | null>(null);
    const [noteText, setNoteText] = useState("");
    const [noteLink, setNoteLink] = useState(NO_LINK);
    const [storyObjects, setStoryObjects] = useState<{ id: string; name: string }[]>([]);
    const [saving, setSaving] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await fetch(`/api/story-objects/${storyObjectId}/snapshots`).catch(() => null);
        if (!res?.ok) {
            toastError(res ? await errorMessage(res, "Could not load snapshots") : "Could not load snapshots");
            return;
        }
        const body = await res.json();
        setSummaries(body.data);
        setAnnotations(body.annotations);
        setIndex((i) => Math.min(i, Math.max(body.data.length - 1, 0)));
    }, [storyObjectId, toastError]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        fetch(`/api/projects/${projectId}/story-objects?limit=200`)
            .then((res) => (res.ok ? res.json() : null))
            .then((body: { data?: { id: string; name: string }[] } | null) =>
                setStoryObjects((body?.data ?? []).filter((o) => o.id !== storyObjectId)),
            )
            .catch(() => setStoryObjects([]));
    }, [projectId, storyObjectId]);

    const summaryId = summaries?.[index]?.id;
    useEffect(() => {
        if (!summaryId) return;
        let current = true;
        fetch(`/api/location-snapshots/${summaryId}`)
            .then(async (res) => {
                if (!res.ok) throw new Error(await errorMessage(res, "Could not load the snapshot"));
                return res.json();
            })
            .then((data: Snapshot) => {
                if (current) setSnapshot(data);
            })
            .catch((e: Error) => toastError(e.message));
        return () => {
            current = false;
        };
    }, [summaryId, toastError]);

    const notesHere = useMemo(
        () => annotations.filter((a) => a.kind === "note" && snapshot && a.snapshotId === snapshot.id),
        [annotations, snapshot],
    );
    const canvasNotes: CanvasNote[] = notesHere.flatMap((a, i) => (a.region ? [{ id: a.id, number: i + 1, region: a.region }] : []));
    const edits = annotations.filter((a) => a.kind !== "note");
    const orphanNotes = annotations.filter((a) => a.kind === "note" && a.snapshotId === null);
    const pendingKeys = useMemo(
        () => new Set(annotations.filter(isPending).map((a) => a.thingKey!)),
        [annotations],
    );
    const selectedThing = snapshot?.things.find((t) => t.key === selectedKey) ?? null;

    const pendingEdit = (key: string, field: ThingField) =>
        annotations.find((a) => a.kind === field && a.thingKey === key && isPending(a));

    const selectThing = (key: string) => {
        const thing = snapshot?.things.find((t) => t.key === key);
        if (!thing) return;
        setDraft(null);
        setSelectedKey(key);
        setEdit({
            name: pendingEdit(key, "name")?.text ?? thing.name,
            description: pendingEdit(key, "description")?.text ?? thing.description,
        });
    };

    const startNote = (region: SnapshotRegion) => {
        setSelectedKey(null);
        setDraft(region);
        setNoteText("");
        setNoteLink(NO_LINK);
    };

    const showSnapshot = (next: number) => {
        setIndex(next);
        setSelectedKey(null);
        setDraft(null);
    };

    const post = async (body: Record<string, unknown>): Promise<boolean> => {
        const res = await fetch(`/api/location-snapshots/${snapshot!.id}/annotations`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1" },
            body: JSON.stringify(body),
        }).catch(() => null);
        if (!res?.ok) toastError(res ? await errorMessage(res, "Could not save") : "Could not save");
        return !!res?.ok;
    };

    const saveEdit = async () => {
        if (!selectedThing) return;
        setSaving(true);
        let ok = true;
        for (const field of ["name", "description"] as const) {
            const before = pendingEdit(selectedThing.key, field)?.text ?? selectedThing[field];
            if (edit[field] !== before) {
                ok = (await post({ kind: field, thingKey: selectedThing.key, text: edit[field] })) && ok;
            }
        }
        setSaving(false);
        if (ok) setSelectedKey(null);
        await load();
    };

    const saveNote = async () => {
        if (!draft) return;
        setSaving(true);
        const ok = await post({
            kind: "note",
            text: noteText,
            region: draft,
            ...(noteLink !== NO_LINK && { storyObjectId: noteLink }),
        });
        setSaving(false);
        if (ok) {
            setDraft(null);
            setTool("select");
        }
        await load();
    };

    const resolve = async (id: string) => {
        const res = await fetch(`/api/snapshot-annotations/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "done" }),
        });
        if (!res.ok) toastError(await errorMessage(res, "Could not resolve"));
        await load();
    };

    const remove = async (id: string) => {
        setDeleteId(null);
        const res = await fetch(`/api/snapshot-annotations/${id}`, { method: "DELETE" });
        if (!res.ok) toastError(await errorMessage(res, "Could not delete"));
        await load();
    };

    if (summaries === null) {
        return <p className="text-xs text-text-muted" role="status">Loading snapshots…</p>;
    }
    if (summaries.length === 0) {
        return (
            <p className="text-sm text-text-muted italic">
                No snapshots yet. The game&apos;s snapshot job posts them with an API token (Settings → API tokens,
                scope <em>Post location snapshots</em>).
            </p>
        );
    }

    const summary = summaries[index];
    const objectName = (id: string | null) => storyObjects.find((o) => o.id === id)?.name;
    const thingName = (key: string | null) =>
        snapshot?.things.find((t) => t.key === key)?.name || key || "";

    const item = (a: Annotation, label?: string) => (
        <li key={a.id} className="flex items-start gap-2 rounded-md bg-surface-overlay/50 px-2.5 py-2">
            <span className={cn("tag-pill mt-0.5 shrink-0", a.status === "done" && "opacity-60")}>{STATUS_LABELS[a.status]}</span>
            <div className="min-w-0 flex-1 text-sm">
                {label && <p className="text-xs font-medium text-text-muted">{label}</p>}
                <p className={cn("whitespace-pre-wrap break-words text-text-primary", a.status === "done" && "text-text-muted")}>
                    {a.text || <span className="italic">(empty)</span>}
                </p>
                {objectName(a.storyObjectId) && (
                    <p className="text-xs text-text-muted">About {objectName(a.storyObjectId)}</p>
                )}
            </div>
            {a.status !== "done" && (
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => resolve(a.id)} aria-label="Resolve">
                    <Check className="h-3.5 w-3.5" />
                </Button>
            )}
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-text-muted hover:text-danger"
                onClick={() => setDeleteId(a.id)}
                aria-label="Delete"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </li>
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === summaries.length - 1}
                    onClick={() => showSnapshot(index + 1)}
                    aria-label="Older snapshot"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1 text-center">
                    <p className="truncate text-sm font-medium text-text-primary">
                        Build {summary.build} · {new Date(summary.takenAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    <p className="text-xs text-text-muted">{summaries.length - index} of {summaries.length}</p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === 0}
                    onClick={() => showSnapshot(index - 1)}
                    aria-label="Newer snapshot"
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex items-center gap-1" role="toolbar" aria-label="Annotation tools">
                {TOOLS.map(({ tool: t, label, Icon }) => (
                    <Button
                        key={t}
                        variant={tool === t ? "secondary" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setTool(t)}
                        aria-label={label}
                        aria-pressed={tool === t}
                        title={label}
                    >
                        <Icon className="h-4 w-4" />
                    </Button>
                ))}
                <span className="ml-2 text-xs text-text-muted">
                    {tool === "select" ? "Click a thing to change its name or description." : "Mark a region, then write a note."}
                </span>
            </div>

            {snapshot?.id === summary.id && (
                <SnapshotCanvas
                    imageUrl={snapshot.imageUrl}
                    width={snapshot.width}
                    height={snapshot.height}
                    things={snapshot.things}
                    notes={canvasNotes}
                    pendingKeys={pendingKeys}
                    selectedKey={selectedKey}
                    tool={tool}
                    draft={draft}
                    onSelectThing={selectThing}
                    onDraw={startNote}
                />
            )}

            {selectedThing && (
                <div className="space-y-3 rounded-md border border-border p-3">
                    <p className="text-xs font-medium text-text-muted">
                        {selectedThing.kind ? `${selectedThing.kind} · ` : ""}<span className="font-mono">{selectedThing.key}</span>
                    </p>
                    {(["name", "description"] as const).map((field) => (
                        <div key={field}>
                            <div className="mb-1.5 flex items-center gap-2">
                                <label htmlFor={`thing-${field}`} className="text-xs font-medium text-text-muted">
                                    {field === "name" ? "Name" : "Description"}
                                </label>
                                {pendingEdit(selectedThing.key, field) && (
                                    <span className="tag-pill text-warning">Changed in Annie, not in the game yet</span>
                                )}
                            </div>
                            {field === "name" ? (
                                <Input
                                    id="thing-name"
                                    value={edit.name}
                                    maxLength={200}
                                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                                />
                            ) : (
                                <Textarea
                                    id="thing-description"
                                    value={edit.description}
                                    maxLength={5000}
                                    rows={3}
                                    onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                                />
                            )}
                        </div>
                    ))}
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedKey(null)}>Cancel</Button>
                        <Button size="sm" onClick={saveEdit} disabled={saving || !edit.name.trim()}>Save request</Button>
                    </div>
                </div>
            )}

            {draft && (
                <div className="space-y-3 rounded-md border border-border p-3">
                    <label htmlFor="snapshot-note" className="block text-xs font-medium text-text-muted">Note</label>
                    <Textarea
                        id="snapshot-note"
                        value={noteText}
                        maxLength={5000}
                        rows={3}
                        autoFocus
                        placeholder="What should change here?"
                        onChange={(e) => setNoteText(e.target.value)}
                    />
                    <div>
                        <label htmlFor="snapshot-note-link" className="mb-1.5 block text-xs font-medium text-text-muted">Link to</label>
                        <Select value={noteLink} onValueChange={setNoteLink}>
                            <SelectTrigger id="snapshot-note-link">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_LINK}>No story object</SelectItem>
                                {storyObjects.map((o) => (
                                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
                        <Button size="sm" onClick={saveNote} disabled={saving || !noteText.trim()}>Save note</Button>
                    </div>
                </div>
            )}

            <section className="space-y-1.5">
                <h3 className="text-xs font-medium text-text-muted">Notes on this snapshot</h3>
                {notesHere.length === 0 ? (
                    <p className="text-xs italic text-text-muted">No notes yet. Pin, box or circle a region to add one.</p>
                ) : (
                    <ol className="space-y-1.5">{notesHere.map((a, i) => item(a, `${i + 1}`))}</ol>
                )}
            </section>

            <section className="space-y-1.5">
                <h3 className="text-xs font-medium text-text-muted">Requested changes</h3>
                {edits.length === 0 ? (
                    <p className="text-xs italic text-text-muted">None. Click a thing to change its name or description.</p>
                ) : (
                    <ul className="space-y-1.5">
                        {edits.map((a) => item(a, `${a.kind === "name" ? "Name" : "Description"} of ${thingName(a.thingKey)}`))}
                    </ul>
                )}
            </section>

            {orphanNotes.length > 0 && (
                <section className="space-y-1.5">
                    <h3 className="text-xs font-medium text-text-muted">Notes from deleted snapshots</h3>
                    <ul className="space-y-1.5">{orphanNotes.map((a) => item(a))}</ul>
                </section>
            )}

            <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this annotation?</AlertDialogTitle>
                        <AlertDialogDescription>This permanently deletes it. This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteId && remove(deleteId)} className="bg-danger hover:bg-danger-hover">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
