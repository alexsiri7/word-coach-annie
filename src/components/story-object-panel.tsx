"use client";

import { useEffect, useState } from "react";
import { X, Save, Trash2, Globe } from "lucide-react";
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

export function StoryObjectPanel({ objectId, source = "project", onClose, onDeleted, onUpdated }: StoryObjectPanelProps) {
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

    const isUniverse = source === "universe";
    const apiBase = isUniverse ? "/api/world-objects" : "/api/story-objects";

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

                if (!isUniverse && data.projectId) {
                    // Fetch project to see if it's linked to a universe
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
        await fetch(`${apiBase}/${objectId}`, {
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
        await fetch(`${apiBase}/${objectId}`, { method: "DELETE" });
        setDeleteOpen(false);
        onDeleted();
    };

    const handleTransfer = async () => {
        if (!project?.universeId) return;
        setTransferring(true);
        try {
            const res = await fetch("/api/universes/transfer-object", {
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
                alert(`Transfer failed: ${errorData.error}`);
            }
        } catch (error) {
            console.error("Transfer error:", error);
            alert("An unexpected error occurred during transfer.");
        } finally {
            setTransferring(false);
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
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div>
                    <label className="block text-xs font-medium text-text-muted mb-1.5">Name</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>

                {obj.type === "CHARACTER" && (
                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-1.5">Role</label>
                        <Select value={role} onValueChange={setRole}>
                            <SelectTrigger>
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
                    <label className="block text-xs font-medium text-text-muted mb-1.5">Description</label>
                    <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        placeholder="Describe this element..."
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-text-muted mb-1.5">Notes</label>
                    <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={4}
                        placeholder="Additional notes..."
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-text-muted mb-1.5">Tags</label>
                    <Input
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="Comma-separated tags"
                    />
                </div>
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
        </div>
    );
}
