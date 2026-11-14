"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, Plus, Star, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { LocationImageKind } from "@/schemas/location-images";

interface LocationImage {
    id: string;
    kind: LocationImageKind;
    caption: string;
    orderIndex: number;
    isCover: boolean;
    width: number;
    height: number;
    thumbUrl: string;
    fullUrl: string;
}

const KIND_LABELS: Record<LocationImageKind, string> = {
    reference: "Reference",
    mood: "Mood",
    sketch: "Sketch",
};

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/gif";

export async function errorMessage(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => null);
    return typeof body?.error === "string" ? body.error : fallback;
}

/** Images of a location: upload by picker, drop or paste; caption, kind, order, cover and delete per tile. */
export function LocationImages({ storyObjectId, onChanged }: { storyObjectId: string; onChanged: () => void }) {
    const { error: toastError } = useToast();
    const [images, setImages] = useState<LocationImage[]>([]);
    const [pending, setPending] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [viewing, setViewing] = useState<LocationImage | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        const res = await fetch(`/api/story-objects/${storyObjectId}/images`).catch(() => null);
        if (res?.ok) setImages((await res.json()).data);
        else toastError(res ? await errorMessage(res, "Could not load images") : "Could not load images");
    }, [storyObjectId, toastError]);

    useEffect(() => {
        load();
    }, [load]);

    const upload = useCallback(async (files: File[]) => {
        const accepted = files.filter((f) => f.type.startsWith("image/"));
        if (accepted.length === 0) return;
        setPending(accepted.length);
        // One at a time: each upload is decoded on the server, which has little memory to spare.
        for (const file of accepted) {
            const form = new FormData();
            form.set("file", file);
            const res = await fetch(`/api/story-objects/${storyObjectId}/images`, {
                method: "POST",
                headers: { "X-CSRF-Protection": "1" },
                body: form,
            }).catch(() => null);
            if (!res?.ok) toastError(res ? await errorMessage(res, "Upload failed") : "Upload failed");
            setPending((n) => n - 1);
        }
        await load();
        onChanged();
    }, [storyObjectId, load, onChanged, toastError]);

    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            const files = Array.from(e.clipboardData?.files ?? []);
            if (files.length === 0) return;
            e.preventDefault();
            upload(files);
        };
        document.addEventListener("paste", onPaste);
        return () => document.removeEventListener("paste", onPaste);
    }, [upload]);

    const change = async (id: string, body: Partial<Pick<LocationImage, "caption" | "kind" | "orderIndex" | "isCover">>) => {
        const res = await fetch(`/api/location-images/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) toastError(await errorMessage(res, "Could not update the image"));
        await load();
        onChanged();
    };

    const remove = async (id: string) => {
        setDeleteId(null);
        const res = await fetch(`/api/location-images/${id}`, { method: "DELETE" });
        if (!res.ok) toastError(await errorMessage(res, "Could not delete the image"));
        await load();
        onChanged();
    };

    return (
        <div
            onDragOver={(e) => {
                if (!e.dataTransfer.types.includes("Files")) return;
                e.preventDefault();
                setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
                if (e.dataTransfer.files.length === 0) return;
                e.preventDefault();
                setDragging(false);
                upload(Array.from(e.dataTransfer.files));
            }}
            className={cn("rounded-md transition-colors", dragging && "bg-accent/10 ring-2 ring-accent/40")}
        >
            <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-text-muted">
                    <ImageIcon className="h-3 w-3 inline mr-1" />
                    Images
                </label>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => fileInput.current?.click()}
                    disabled={pending > 0}
                >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                </Button>
                <input
                    ref={fileInput}
                    type="file"
                    accept={ACCEPTED_TYPES}
                    multiple
                    hidden
                    aria-label="Add images"
                    onChange={(e) => {
                        upload(Array.from(e.target.files ?? []));
                        e.target.value = "";
                    }}
                />
            </div>

            {pending > 0 && (
                <p className="text-xs text-text-muted mb-2" role="status">Uploading {pending}…</p>
            )}

            {images.length === 0 ? (
                <p className="text-xs text-text-muted italic">
                    No images yet. Add, drop or paste reference art, mood pictures or sketches.
                </p>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
                    {images.map((image, index) => (
                        <div key={image.id} className="rounded-md bg-surface-overlay/50 p-1.5 space-y-1.5">
                            <button
                                type="button"
                                className="block w-full aspect-square overflow-hidden rounded-sm bg-surface-overlay"
                                onClick={() => setViewing(image)}
                                aria-label={`View ${image.caption || "image"} full size`}
                            >
                                <img
                                    src={image.thumbUrl}
                                    alt={image.caption}
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-cover"
                                />
                            </button>
                            <Input
                                key={`${image.id}:${image.caption}`}
                                defaultValue={image.caption}
                                placeholder="Caption"
                                aria-label="Caption"
                                className="h-7 text-xs"
                                maxLength={500}
                                onBlur={(e) => {
                                    if (e.target.value !== image.caption) change(image.id, { caption: e.target.value });
                                }}
                            />
                            <Select value={image.kind} onValueChange={(kind) => change(image.id, { kind: kind as LocationImageKind })}>
                                <SelectTrigger className="h-7 text-xs" aria-label="Kind">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(KIND_LABELS) as LocationImageKind[]).map((kind) => (
                                        <SelectItem key={kind} value={kind}>{KIND_LABELS[kind]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="flex items-center justify-between">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={index === 0}
                                    onClick={() => change(image.id, { orderIndex: index - 1 })}
                                    aria-label="Move earlier"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={index === images.length - 1}
                                    onClick={() => change(image.id, { orderIndex: index + 1 })}
                                    aria-label="Move later"
                                >
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn("h-7 w-7", image.isCover && "text-accent")}
                                    onClick={() => !image.isCover && change(image.id, { isCover: true })}
                                    aria-label={image.isCover ? "Cover image" : "Set as cover"}
                                    aria-pressed={image.isCover}
                                >
                                    <Star className={cn("h-3.5 w-3.5", image.isCover && "fill-current")} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-text-muted hover:text-danger"
                                    onClick={() => setDeleteId(image.id)}
                                    aria-label="Delete image"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={!!viewing} onOpenChange={(open) => { if (!open) setViewing(null); }}>
                <DialogContent className="max-w-4xl">
                    <DialogTitle>{viewing?.caption || "Image"}</DialogTitle>
                    <DialogDescription>
                        {viewing && `${KIND_LABELS[viewing.kind]} · ${viewing.width}×${viewing.height}`}
                    </DialogDescription>
                    {viewing && (
                        <img
                            src={viewing.fullUrl}
                            alt={viewing.caption}
                            className="max-h-[75vh] w-full object-contain rounded-sm"
                        />
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete image?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently deletes the image. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteId && remove(deleteId)}
                            className="bg-danger hover:bg-danger-hover"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
