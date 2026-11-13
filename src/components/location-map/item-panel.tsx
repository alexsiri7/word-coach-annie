"use client";

import { ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { normaliseRotation, type LocationMapItem, type LocationMapItemKind } from "@/schemas/location-map";
import { MIN_SIZE_M, resize } from "./geometry";

export const KIND_LABELS: Record<LocationMapItemKind, string> = {
    object: "Object",
    character: "Character",
    exit: "Exit",
    area: "Area",
    note: "Note",
};

export interface LinkOption {
    id: string;
    name: string;
}

interface ItemPanelProps {
    item: LocationMapItem;
    /** Story objects this kind may link to, or undefined when it takes no link. */
    linkOptions: LinkOption[] | undefined;
    linkName: string | null;
    onChange: (item: LocationMapItem) => void;
    onDelete: () => void;
    onOpenExit: (item: LocationMapItem) => void;
}

const NO_LINK = "none";

function linkOf(item: LocationMapItem): string | null {
    return item.storyObjectId ?? item.targetLocationId ?? null;
}

function withLink(item: LocationMapItem, id: string | null): LocationMapItem {
    return item.kind === "exit" ? { ...item, targetLocationId: id } : { ...item, storyObjectId: id };
}

/** Commits on blur or Enter, so typing a number is one undo step. */
function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
    return (
        <label className="block">
            <span className="block text-[11px] text-text-muted mb-0.5">{label}</span>
            <Input
                key={value}
                type="number"
                step="any"
                inputMode="decimal"
                defaultValue={value}
                className="h-7 px-2 text-xs"
                onBlur={(e) => {
                    const next = Number(e.target.value);
                    if (e.target.value !== "" && Number.isFinite(next) && next !== value) onCommit(next);
                    else e.target.value = String(value);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                }}
            />
        </label>
    );
}

export function ItemPanel({ item, linkOptions, linkName, onChange, onDelete, onOpenExit }: ItemPanelProps) {
    const link = linkOf(item);
    const unlinked = link !== null && linkName === null;

    return (
        <div className="space-y-3 text-sm" data-testid="map-item-panel">
            <div className="flex items-center justify-between">
                <span className="tag-pill text-accent">{KIND_LABELS[item.kind]}</span>
                {unlinked && <span className="tag-pill text-[10px] bg-danger/10 text-danger">Unlinked</span>}
            </div>

            <label className="block">
                <span className="block text-xs font-medium text-text-muted mb-1">Label</span>
                <Input
                    key={`${item.id}:label:${item.label}`}
                    defaultValue={item.label}
                    maxLength={100}
                    className="h-8"
                    onBlur={(e) => {
                        if (e.target.value !== item.label) onChange({ ...item, label: e.target.value });
                    }}
                />
            </label>

            {linkOptions && (
                <div>
                    <span className="block text-xs font-medium text-text-muted mb-1">
                        {item.kind === "exit" ? "Leads to" : `Linked ${item.kind === "character" ? "character" : "world element"}`}
                    </span>
                    <Select value={link ?? NO_LINK} onValueChange={(id) => onChange(withLink(item, id === NO_LINK ? null : id))}>
                        <SelectTrigger className="h-8" aria-label="Link">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NO_LINK}>None</SelectItem>
                            {unlinked && link && (
                                <SelectItem value={link} disabled>Deleted story object</SelectItem>
                            )}
                            {linkOptions.map((option) => (
                                <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {item.kind === "exit" && item.targetLocationId && linkName && (
                        <Button variant="outline" size="sm" className="mt-2 w-full gap-1.5" onClick={() => onOpenExit(item)}>
                            Open {linkName} map
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            )}

            <label className="block">
                <span className="block text-xs font-medium text-text-muted mb-1">Description</span>
                <Textarea
                    key={`${item.id}:description:${item.description}`}
                    defaultValue={item.description}
                    maxLength={2000}
                    rows={3}
                    placeholder="What is here, how it looks, what happens…"
                    onBlur={(e) => {
                        if (e.target.value !== item.description) onChange({ ...item, description: e.target.value });
                    }}
                />
            </label>

            <div className="grid grid-cols-3 gap-2">
                <NumberField label="X (m)" value={item.x} onCommit={(x) => onChange({ ...item, x })} />
                <NumberField label="Y (m)" value={item.y} onCommit={(y) => onChange({ ...item, y })} />
                <NumberField label="Rotation (°)" value={item.rotation} onCommit={(r) => onChange({ ...item, rotation: normaliseRotation(r) })} />
                <NumberField label="Width (m)" value={item.w} onCommit={(w) => onChange(resize(item, Math.max(MIN_SIZE_M, w), item.h))} />
                <NumberField label="Height (m)" value={item.h} onCommit={(h) => onChange(resize(item, item.w, Math.max(MIN_SIZE_M, h)))} />
            </div>

            <Button
                variant="ghost"
                size="sm"
                className="w-full text-danger hover:text-danger-hover hover:bg-danger/10"
                onClick={onDelete}
            >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete {KIND_LABELS[item.kind].toLowerCase()}
            </Button>
        </div>
    );
}
