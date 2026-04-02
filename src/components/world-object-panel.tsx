"use client";

import { useEffect, useState } from "react";
import { X, Save, Trash2, Plus, Clock, MoveUp, MoveDown, Link, Unlink, Copy } from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { WorldObject, WorldObjectTimelineEntry, Relationship } from "@/lib/types";

const RELATIONSHIP_TYPES = [
    "APPEARS_IN",
    "LOCATED_AT",
    "PART_OF_PLOTLINE",
    "RELATED_TO",
    "INTERACTS_WITH",
    "CONTAINS",
    "PRECEDES",
    "FOLLOWS",
] as const;

const RELATIONSHIP_TYPE_LABELS: Record<string, string> = {
    APPEARS_IN: "Appears in",
    LOCATED_AT: "Located at",
    PART_OF_PLOTLINE: "Part of plotline",
    RELATED_TO: "Related to",
    INTERACTS_WITH: "Interacts with",
    CONTAINS: "Contains",
    PRECEDES: "Precedes",
    FOLLOWS: "Follows",
};

interface NormalizedRelationship {
    relationshipId: string;
    type: string;
    label: string;
    direction: "outgoing" | "incoming";
    target: {
        id: string;
        name: string;
        entityType: string;
    } | null;
}

function normalizeRelationships(data: WorldObject): NormalizedRelationship[] {
    const rels: NormalizedRelationship[] = [];
    if (Array.isArray(data.relationships)) {
        for (const r of data.relationships as Relationship[]) {
            const target = r.toNode
                ? { id: r.toNode.id, name: (r.toNode as unknown as { title: string }).title, entityType: r.toNode.type as string }
                : r.toObject
                    ? { id: r.toObject.id, name: r.toObject.name, entityType: r.toObject.type }
                    : r.toWorldObject
                        ? { id: r.toWorldObject.id, name: r.toWorldObject.name, entityType: r.toWorldObject.type }
                        : null;
            rels.push({ relationshipId: r.id, type: r.type, label: r.label, direction: "outgoing", target });
        }
    }
    if (Array.isArray(data.relatedBy)) {
        for (const r of data.relatedBy as Relationship[]) {
            const target = r.fromNode
                ? { id: r.fromNode.id, name: (r.fromNode as unknown as { title: string }).title, entityType: r.fromNode.type as string }
                : r.fromObject
                    ? { id: r.fromObject.id, name: r.fromObject.name, entityType: r.fromObject.type }
                    : r.fromWorldObject
                        ? { id: r.fromWorldObject.id, name: r.fromWorldObject.name, entityType: r.fromWorldObject.type }
                        : null;
            rels.push({ relationshipId: r.id, type: r.type, label: r.label, direction: "incoming", target });
        }
    }
    return rels;
}

interface WorldObjectPanelProps {
    objectId: string;
    onClose: () => void;
    onDeleted: () => void;
    onUpdated: () => void;
}

export function WorldObjectPanel({ objectId, onClose, onDeleted, onUpdated }: WorldObjectPanelProps) {
    const { error: toastError } = useToast();
    const [wo, setWo] = useState<WorldObject | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [notes, setNotes] = useState("");
    const [type, setType] = useState<string>("");
    const [tags, setTags] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [copyOpen, setCopyOpen] = useState(false);
    const [copying, setCopying] = useState(false);
    const [linkedProjects, setLinkedProjects] = useState<{ id: string; title: string }[]>([]);

    // Timeline state
    const [timeline, setTimeline] = useState<WorldObjectTimelineEntry[]>([]);
    const [newEntryOpen, setNewEntryOpen] = useState(false);
    const [newEntryLabel, setNewEntryLabel] = useState("");
    const [newEntryDesc, setNewEntryDesc] = useState("");
    const [relationships, setRelationships] = useState<NormalizedRelationship[]>([]);

    // Relationship management state
    const [addRelOpen, setAddRelOpen] = useState(false);
    const [relType, setRelType] = useState("");
    const [relTargetId, setRelTargetId] = useState("");
    const [relLabel, setRelLabel] = useState("");
    const [availableTargets, setAvailableTargets] = useState<Array<{ id: string; name: string; type: string }>>([]);
    const [addingRel, setAddingRel] = useState(false);
    const [deleteRelId, setDeleteRelId] = useState<string | null>(null);

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
            setRelationships(normalizeRelationships(data));
        }
    };

    useEffect(() => {
        fetchWo();
    }, [objectId]);

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        const res = await offlineFetch(`/api/world-objects/${objectId}`, {
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
        await offlineFetch(`/api/world-objects/${objectId}`, { method: "DELETE" });
        setDeleteOpen(false);
        onDeleted();
    };

    const handleAddTimelineEntry = async () => {
        if (!newEntryLabel.trim()) return;
        const res = await offlineFetch(`/api/world-objects/${objectId}/timeline`, {
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
        const res = await offlineFetch(`/api/world-objects/${objectId}/timeline/${entryId}`, {
            method: "DELETE",
        });
        if (res.ok) fetchWo();
    };

    const handleOpenCopy = async () => {
        if (!wo) return;
        const res = await fetch(`/api/universes/${wo.universeId}`);
        if (res.ok) {
            const data = await res.json();
            setLinkedProjects(data.projects || []);
        }
        setCopyOpen(true);
    };

    const handleCopyToProject = async (projectId: string) => {
        setCopying(true);
        try {
            const res = await offlineFetch(`/api/projects/${projectId}/copy-world-object`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ worldObjectId: objectId }),
            });
            if (res.ok) {
                setCopyOpen(false);
                onUpdated();
            }
        } finally {
            setCopying(false);
        }
    };

    const handleReorder = async (startIndex: number, direction: 'up' | 'down') => {
        const newTimeline = [...timeline];
        const endIndex = direction === 'up' ? startIndex - 1 : startIndex + 1;
        if (endIndex < 0 || endIndex >= newTimeline.length) return;

        const [removed] = newTimeline.splice(startIndex, 1);
        newTimeline.splice(endIndex, 0, removed);

        setTimeline(newTimeline); // Optimistic update

        await offlineFetch(`/api/world-objects/${objectId}/timeline/reorder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderedIds: newTimeline.map(t => t.id) }),
        });
        fetchWo();
    };

    const fetchAvailableTargets = async () => {
        if (!wo?.universeId) return;
        try {
            const res = await fetch(`/api/universes/${wo.universeId}/world-objects`);
            if (res.ok) {
                const data = await res.json();
                const objects = (data || []) as Array<{ id: string; name: string; type: string }>;
                setAvailableTargets(objects.filter((o) => o.id !== objectId));
            }
        } catch {
            setAvailableTargets([]);
        }
    };

    const handleOpenAddRel = () => {
        setRelType("");
        setRelTargetId("");
        setRelLabel("");
        fetchAvailableTargets();
        setAddRelOpen(true);
    };

    const handleAddRelationship = async () => {
        if (!relType || !relTargetId) return;
        setAddingRel(true);
        try {
            const res = await offlineFetch(`/api/world-objects/${objectId}/relationships`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: relType,
                    toWorldObjectId: relTargetId,
                    ...(relLabel && { label: relLabel }),
                }),
            });
            if (res.ok) {
                setAddRelOpen(false);
                fetchWo();
                onUpdated();
            } else {
                const err = await res.json();
                toastError(err.error || "Failed to create relationship");
            }
        } catch {
            toastError("Failed to create relationship");
        } finally {
            setAddingRel(false);
        }
    };

    const handleDeleteRelationship = async (relationshipId: string) => {
        try {
            await offlineFetch(`/api/relationships/${relationshipId}`, { method: "DELETE" });
            setRelationships(prev => prev.filter(r => r.relationshipId !== relationshipId));
            setDeleteRelId(null);
            onUpdated();
        } catch {
            toastError("Failed to delete relationship");
        }
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
                    <p className="text-xs text-text-muted leading-relaxed">
                        Track how this {wo.type.toLowerCase()} changes over story time. Annie uses this to check consistency across scenes.
                    </p>

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

                {/* Relationships Section */}
                <div className="space-y-4 border-t border-border pt-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Link className="h-4 w-4 text-accent" />
                            <h3 className="text-sm font-semibold text-text-primary tracking-tight">Relationships</h3>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={handleOpenAddRel}>
                            <Plus className="h-3.5 w-3.5" />
                            Add
                        </Button>
                    </div>
                    {relationships.length === 0 ? (
                        <p className="text-xs text-text-muted italic">No relationships yet.</p>
                    ) : (
                        <div className="space-y-1.5">
                            {relationships.map((rel) => (
                                <div
                                    key={rel.relationshipId}
                                    className="group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-surface-overlay/50 hover:bg-surface-overlay transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 text-xs">
                                            <span className="tag-pill text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent/80">
                                                {rel.direction === "incoming" ? "\u2190" : "\u2192"} {RELATIONSHIP_TYPE_LABELS[rel.type] || rel.type}
                                            </span>
                                            {rel.target && (
                                                <span className="truncate font-medium text-text-primary">
                                                    {rel.target.name}
                                                </span>
                                            )}
                                        </div>
                                        {rel.label && (
                                            <p className="text-[11px] text-text-muted mt-0.5 truncate">{rel.label}</p>
                                        )}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-danger"
                                        onClick={() => setDeleteRelId(rel.relationshipId)}
                                        aria-label="Remove relationship"
                                    >
                                        <Unlink className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
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
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={handleOpenCopy}
                    >
                        <Copy className="h-4 w-4" />
                        Copy to Project
                    </Button>
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

            {/* Copy to Project dialog */}
            <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Copy to Project</DialogTitle>
                        <DialogDescription>
                            Import &ldquo;{wo.name}&rdquo; into a linked project as a story object. The original stays in the universe.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2 max-h-[300px] overflow-y-auto space-y-1">
                        {linkedProjects.length === 0 ? (
                            <p className="text-sm text-text-muted text-center py-4">
                                No projects are linked to this universe yet.
                            </p>
                        ) : (
                            linkedProjects.map((p) => (
                                <button
                                    key={p.id}
                                    className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-overlay text-sm flex items-center justify-between"
                                    onClick={() => handleCopyToProject(p.id)}
                                    disabled={copying}
                                >
                                    {p.title}
                                    <Copy className="h-3 w-3 text-text-muted" />
                                </button>
                            ))
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCopyOpen(false)}>Cancel</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Relationship dialog */}
            <Dialog open={addRelOpen} onOpenChange={setAddRelOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Relationship</DialogTitle>
                        <DialogDescription>
                            Create a relationship from &ldquo;{wo.name}&rdquo; to another world object.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <label htmlFor="wo-rel-type" className="block text-xs font-medium text-text-muted mb-1.5">Type</label>
                            <Select value={relType} onValueChange={setRelType}>
                                <SelectTrigger id="wo-rel-type">
                                    <SelectValue placeholder="Select relationship type..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {RELATIONSHIP_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {RELATIONSHIP_TYPE_LABELS[t]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label htmlFor="wo-rel-target" className="block text-xs font-medium text-text-muted mb-1.5">Target</label>
                            <Select value={relTargetId} onValueChange={setRelTargetId}>
                                <SelectTrigger id="wo-rel-target">
                                    <SelectValue placeholder="Select target..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableTargets.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            <span className="flex items-center gap-2">
                                                <span className="text-[10px] uppercase text-text-muted">{t.type}</span>
                                                {t.name}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label htmlFor="wo-rel-label" className="block text-xs font-medium text-text-muted mb-1.5">Label (optional)</label>
                            <Input
                                id="wo-rel-label"
                                value={relLabel}
                                onChange={(e) => setRelLabel(e.target.value)}
                                placeholder="e.g., mentor, rival, birthplace..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddRelOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddRelationship} disabled={addingRel || !relType || !relTargetId}>
                            {addingRel ? "Adding..." : "Add Relationship"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Relationship confirmation */}
            <AlertDialog open={!!deleteRelId} onOpenChange={(open) => { if (!open) setDeleteRelId(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Relationship?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove this relationship. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteRelId && handleDeleteRelationship(deleteRelId)}
                            className="bg-danger hover:bg-danger-hover"
                        >
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
