"use client";

import { useEffect, useState } from "react";
import { X, Save, Trash2, Globe, Plus, Link, Unlink } from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { useToast } from "@/components/ui/toast";
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
import type { StoryObject, StoryObjectType, Project } from "@/lib/types";

interface StoryObjectPanelProps {
    objectId: string;
    source?: "project" | "universe";
    onClose: () => void;
    onDeleted: () => void;
    onUpdated: () => void;
}

const TYPE_LABELS: Record<StoryObjectType, string> = {
    CHARACTER: "Character",
    LOCATION: "Location",
    PLOTLINE: "Plotline",
    WORLD_ELEMENT: "World Element",
    NOTE: "Note",
};

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

export function StoryObjectPanel({ objectId, source = "project", onClose, onDeleted, onUpdated }: StoryObjectPanelProps) {
    const { error: toastError } = useToast();
    const [obj, setObj] = useState<StoryObject | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [notes, setNotes] = useState("");
    const [role, setRole] = useState("");
    const [tags, setTags] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [project, setProject] = useState<Project | null>(null);
    const [transferOpen, setTransferOpen] = useState(false);
    const [transferring, setTransferring] = useState(false);
    const [relationships, setRelationships] = useState<NormalizedRelationship[]>([]);
    const [addRelOpen, setAddRelOpen] = useState(false);
    const [relType, setRelType] = useState("");
    const [relTargetId, setRelTargetId] = useState("");
    const [relLabel, setRelLabel] = useState("");
    const [availableTargets, setAvailableTargets] = useState<Array<{ id: string; name: string; type: string; source?: string }>>([]);
    const [addingRel, setAddingRel] = useState(false);
    const [deleteRelId, setDeleteRelId] = useState<string | null>(null);

    const isUniverse = source === "universe";
    const apiBase = isUniverse ? "/api/world-objects" : "/api/story-objects";

    const normalizeRelationships = (data: Record<string, unknown>): NormalizedRelationship[] => {
        const rels: NormalizedRelationship[] = [];
        interface RawRelationship {
            id: string;
            type: string;
            label: string;
            toNode?: { id: string; title: string; type: string } | null;
            toObject?: { id: string; name: string; type: string } | null;
            toWorldObject?: { id: string; name: string; type: string } | null;
            fromNode?: { id: string; title: string; type: string } | null;
            fromObject?: { id: string; name: string; type: string } | null;
            fromWorldObject?: { id: string; name: string; type: string } | null;
        }
        if (Array.isArray(data.relationships)) {
            for (const r of data.relationships as RawRelationship[]) {
                const target = r.toNode
                    ? { id: r.toNode.id, name: r.toNode.title, entityType: r.toNode.type }
                    : r.toObject
                        ? { id: r.toObject.id, name: r.toObject.name, entityType: r.toObject.type }
                        : r.toWorldObject
                            ? { id: r.toWorldObject.id, name: r.toWorldObject.name, entityType: r.toWorldObject.type }
                            : null;
                rels.push({ relationshipId: r.id, type: r.type, label: r.label, direction: "outgoing", target });
            }
        }
        if (Array.isArray(data.relatedBy)) {
            for (const r of data.relatedBy as RawRelationship[]) {
                const target = r.fromNode
                    ? { id: r.fromNode.id, name: r.fromNode.title, entityType: r.fromNode.type }
                    : r.fromObject
                        ? { id: r.fromObject.id, name: r.fromObject.name, entityType: r.fromObject.type }
                        : r.fromWorldObject
                            ? { id: r.fromWorldObject.id, name: r.fromWorldObject.name, entityType: r.fromWorldObject.type }
                            : null;
                rels.push({ relationshipId: r.id, type: r.type, label: r.label, direction: "incoming", target });
            }
        }
        return rels;
    };

    useEffect(() => {
        fetch(`${apiBase}/${objectId}`)
            .then((res) => res.json())
            .then((data) => {
                setObj(data);
                setName(data.name || "");
                setDescription(data.description || "");
                setNotes(data.notes || "");
                setRole(data.role || "");
                setTags(data.tags || "");
                setRelationships(normalizeRelationships(data));

                if (!isUniverse && data.projectId) {
                    fetch(`/api/projects/${data.projectId}`)
                        .then(res => res.json())
                        .then(p => setProject(p));
                }
            });
    }, [objectId, apiBase, isUniverse]);

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        const body = isUniverse
            ? { name, description, notes, tags }
            : { name, description, notes, role: role || null, tags };
        await offlineFetch(`${apiBase}/${objectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        setSaving(false);
        setSaved(true);
        onUpdated();
        setTimeout(() => setSaved(false), 2000);
    };

    const handleDelete = async () => {
        await offlineFetch(`${apiBase}/${objectId}`, { method: "DELETE" });
        setDeleteOpen(false);
        onDeleted();
    };

    const handleTransfer = async () => {
        if (!project?.universeId) return;
        setTransferring(true);
        try {
            const res = await offlineFetch("/api/universes/transfer-object", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    storyObjectId: objectId,
                    universeId: project.universeId
                })
            });
            if (res.ok) {
                setTransferOpen(false);
                onDeleted(); // Treat as deleted from project context
            } else {
                const errorData = await res.json();
                console.error("Transfer failed:", errorData.error);
                toastError(`Transfer failed: ${errorData.error}`);
            }
        } catch (error) {
            console.error("Transfer error:", error);
            toastError("An unexpected error occurred during transfer.");
        } finally {
            setTransferring(false);
        }
    };

    const fetchAvailableTargets = async () => {
        if (!obj?.projectId) return;
        try {
            const res = await fetch(`/api/projects/${obj.projectId}/story-objects`);
            const data = await res.json();
            const objects = (data.objects || data || []) as Array<{ id: string; name: string; type: string; source?: string }>;
            setAvailableTargets(objects.filter((o: { id: string }) => o.id !== objectId));
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
        if (!obj?.projectId || !relType || !relTargetId) return;
        setAddingRel(true);
        try {
            const res = await offlineFetch(`/api/projects/${obj.projectId}/relationships`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: relType,
                    fromObjectId: objectId,
                    toObjectId: relTargetId,
                    ...(relLabel && { label: relLabel }),
                }),
            });
            if (res.ok) {
                setAddRelOpen(false);
                // Re-fetch the object to get updated relationships
                const objRes = await fetch(`${apiBase}/${objectId}`);
                const data = await objRes.json();
                setRelationships(normalizeRelationships(data));
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

    if (!obj) {
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
                    <span className="tag-pill text-accent">{TYPE_LABELS[obj.type as StoryObjectType] || obj.type}</span>
                    {isUniverse && (
                        <span className="tag-pill text-xs bg-accent/10 text-accent/80 flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            Universe
                        </span>
                    )}
                    <h2 className="font-semibold text-text-primary truncate">{obj.name}</h2>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onClose} aria-label="Close panel">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div>
                    <label htmlFor="obj-name" className="block text-xs font-medium text-text-muted mb-1.5">Name</label>
                    <Input id="obj-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>

                {obj.type === "CHARACTER" && (
                    <div>
                        <label htmlFor="obj-role" className="block text-xs font-medium text-text-muted mb-1.5">Role</label>
                        <Select value={role} onValueChange={setRole}>
                            <SelectTrigger id="obj-role">
                                <SelectValue placeholder="Select role..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="protagonist">Protagonist</SelectItem>
                                <SelectItem value="antagonist">Antagonist</SelectItem>
                                <SelectItem value="supporting">Supporting</SelectItem>
                                <SelectItem value="minor">Minor</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <div>
                    <label htmlFor="obj-description" className="block text-xs font-medium text-text-muted mb-1.5">Description</label>
                    <Textarea
                        id="obj-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        placeholder="Describe this element..."
                    />
                </div>

                <div>
                    <label htmlFor="obj-notes" className="block text-xs font-medium text-text-muted mb-1.5">Notes</label>
                    <Textarea
                        id="obj-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={4}
                        placeholder="Additional notes..."
                    />
                </div>

                <div>
                    <label htmlFor="obj-tags" className="block text-xs font-medium text-text-muted mb-1.5">Tags</label>
                    <Input
                        id="obj-tags"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="Comma-separated tags"
                    />
                </div>

                {/* Relationships Section */}
                {!isUniverse && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-medium text-text-muted">
                                <Link className="h-3 w-3 inline mr-1" />
                                Relationships
                            </label>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleOpenAddRel}>
                                <Plus className="h-3 w-3 mr-1" />
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
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 pb-6 border-t border-border bg-surface-raised">
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
                    {!isUniverse && project?.universeId && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => setTransferOpen(true)}
                        >
                            <Globe className="h-4 w-4" />
                            Move to Universe
                        </Button>
                    )}
                    {saved && <span className="text-xs text-success" role="status">Saved!</span>}
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
                        <AlertDialogTitle>Delete &ldquo;{obj.name}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this {TYPE_LABELS[obj.type as StoryObjectType]?.toLowerCase()} and all its relationships.
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

            {/* Transfer confirmation */}
            <AlertDialog open={transferOpen} onOpenChange={setTransferOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Move to Universe?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will move &ldquo;{obj.name}&rdquo; from this project to the shared universe.
                            Existing project relationships (like scene appearances) will be preserved.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleTransfer}
                            disabled={transferring}
                            className="bg-accent hover:bg-accent-hover"
                        >
                            {transferring ? "Moving..." : "Move to Universe"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Add Relationship dialog */}
            <Dialog open={addRelOpen} onOpenChange={setAddRelOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Relationship</DialogTitle>
                        <DialogDescription>
                            Create a relationship from &ldquo;{obj.name}&rdquo; to another story element.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <label htmlFor="rel-type" className="block text-xs font-medium text-text-muted mb-1.5">Type</label>
                            <Select value={relType} onValueChange={setRelType}>
                                <SelectTrigger id="rel-type">
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
                            <label htmlFor="rel-target" className="block text-xs font-medium text-text-muted mb-1.5">Target</label>
                            <Select value={relTargetId} onValueChange={setRelTargetId}>
                                <SelectTrigger id="rel-target">
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
                            <label htmlFor="rel-label" className="block text-xs font-medium text-text-muted mb-1.5">Label (optional)</label>
                            <Input
                                id="rel-label"
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
