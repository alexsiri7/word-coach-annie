"use client";

import { useEffect, useState } from "react";
import { X, Save, Trash2, Plus, Clock, MoveUp, MoveDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";
import type { WorldObject, WorldObjectTimelineEntry } from "@/lib/types";

interface WorldObjectPanelProps {
    objectId: string;
    onClose: () => void;
    onDeleted: () => void;
    onUpdated: () => void;
}

export function WorldObjectPanel({ objectId, onClose, onDeleted, onUpdated }: WorldObjectPanelProps) {
    const [wo, setWo] = useState<WorldObject | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [notes, setNotes] = useState("");
    const [type, setType] = useState<any>("");
    const [tags, setTags] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);

    // Timeline state
    const [timeline, setTimeline] = useState<WorldObjectTimelineEntry[]>([]);
    const [newEntryOpen, setNewEntryOpen] = useState(false);
    const [newEntryLabel, setNewEntryLabel] = useState("");
    const [newEntryDesc, setNewEntryDesc] = useState("");

    const fetchWo = async () => {
        const res = await fetch(`/api/world-objects/${objectId}`);
        if (res.ok) {
            const data = await res.json();
            setWo(data);
            setName(data.name || "");
            setDescription(data.description || "");
            setNotes(data.notes || "");
            setType(data.type || "");
            setTags(data.tags || "");
            setTimeline(data.timeline || []);
        }
    };

    useEffect(() => {
        fetchWo();
    }, [objectId]);

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        const res = await fetch(`/api/world-objects/${objectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description, notes, type, tags }),
        });
        if (res.ok) {
            setSaved(true);
            onUpdated();
            setTimeout(() => setSaved(false), 2000);
        }
        setSaving(false);
    };

    const handleDelete = async () => {
        await fetch(`/api/world-objects/${objectId}`, { method: "DELETE" });
        setDeleteOpen(false);
        onDeleted();
    };

    const handleAddTimelineEntry = async () => {
        if (!newEntryLabel.trim()) return;
        const res = await fetch(`/api/world-objects/${objectId}/timeline`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: newEntryLabel, description: newEntryDesc }),
        });
        if (res.ok) {
            setNewEntryLabel("");
            setNewEntryDesc("");
            setNewEntryOpen(false);
            fetchWo();
        }
    };

    const handleDeleteTimelineEntry = async (entryId: string) => {
        const res = await fetch(`/api/world-objects/${objectId}/timeline/${entryId}`, {
            method: "DELETE",
        });
        if (res.ok) fetchWo();
    };

    const handleReorder = async (startIndex: number, direction: 'up' | 'down') => {
        const newTimeline = [...timeline];
        const endIndex = direction === 'up' ? startIndex - 1 : startIndex + 1;
        if (endIndex < 0 || endIndex >= newTimeline.length) return;

        const [removed] = newTimeline.splice(startIndex, 1);
        newTimeline.splice(endIndex, 0, removed);

        setTimeline(newTimeline); // Optimistic update

        await fetch(`/api/world-objects/${objectId}/timeline/reorder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderedIds: newTimeline.map(t => t.id) }),
        });
        fetchWo();
    };

    if (!wo) {
        return (
            <div className="flex items-center justify-center h-full text-text-muted">
                <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-surface animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-raised">
                <div className="flex items-center gap-2">
                    <span className="tag-pill text-accent">{wo.type}</span>
                    <h2 className="font-semibold text-text-primary truncate">{wo.name}</h2>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-8">
                {/* Basic Info */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Name</label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Description</label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Briefly describe this..."
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Notes</label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Secret notes, backstory..."
                        />
                    </div>
                </div>

                {/* Timeline Section */}
                <div className="space-y-4 border-t border-border pt-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-accent" />
                            <h3 className="text-sm font-semibold text-text-primary tracking-tight">Timeline</h3>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setNewEntryOpen(true)}>
                            <Plus className="h-3.5 w-3.5" />
                            Add Entry
                        </Button>
                    </div>

                    {newEntryOpen && (
                        <div className="glass-card p-4 space-y-3 bg-surface-overlay border-accent/20">
                            <Input
                                value={newEntryLabel}
                                onChange={(e) => setNewEntryLabel(e.target.value)}
                                placeholder="Label (e.g. 'Age 20', 'Post-War')"
                                className="h-8 text-sm"
                                autoFocus
                            />
                            <Textarea
                                value={newEntryDesc}
                                onChange={(e) => setNewEntryDesc(e.target.value)}
                                placeholder="What's true at this point?"
                                rows={2}
                                className="text-sm min-h-[60px]"
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setNewEntryOpen(false)}>Cancel</Button>
                                <Button size="sm" onClick={handleAddTimelineEntry} disabled={!newEntryLabel.trim()}>Add</Button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2.5 relative">
                        {timeline.length > 1 && (
                            <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-border -z-0" />
                        )}
                        {timeline.map((entry, i) => (
                            <div key={entry.id} className="group flex gap-4 relative z-10">
                                <div className="h-8 w-8 rounded-full bg-surface-overlay border border-border flex items-center justify-center flex-shrink-0">
                                    <div className="h-2 w-2 rounded-full bg-accent" />
                                </div>
                                <div className="flex-1 glass-card p-3 bg-surface-raised/50 group-hover:bg-surface-raised transition-colors">
                                    <div className="flex items-start justify-between">
                                        <span className="text-sm font-semibold text-accent">{entry.label}</span>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleReorder(i, 'up')} disabled={i === 0}>
                                                <MoveUp className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleReorder(i, 'down')} disabled={i === timeline.length - 1}>
                                                <MoveDown className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-danger hover:text-danger/10" onClick={() => handleDeleteTimelineEntry(entry.id)}>
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                    {entry.description && (
                                        <p className="text-sm text-text-secondary mt-1">{entry.description}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tags */}
                <div className="border-t border-border pt-6">
                    <label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Tags</label>
                    <Input
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="fantasy, royal, ancient..."
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-surface-raised">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:text-danger-hover hover:bg-danger/10"
                    onClick={() => setDeleteOpen(true)}
                >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Delete
                </Button>
                <div className="flex items-center gap-2">
                    {saved && <span className="text-xs text-success">Saved!</span>}
                    <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
                        <Save className="h-4 w-4 mr-1.5" />
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </div>
            </div>

            {/* Delete confirmation */}
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete &ldquo;{wo.name}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this world object and its entire timeline.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-danger hover:bg-danger-hover">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
