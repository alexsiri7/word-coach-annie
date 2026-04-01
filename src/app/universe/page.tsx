"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Globe, MoreVertical, Pencil, Trash2, Sparkles, Link, ArrowLeft } from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface Universe {
    id: string;
    title: string;
    description: string;
    projectCount: number;
    worldObjectCount: number;
    createdAt: string;
    updatedAt: string;
}

export default function UniversesPage() {
    const router = useRouter();
    const [universes, setUniverses] = useState<Universe[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Universe | null>(null);
    const [newTitle, setNewTitle] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [editTarget, setEditTarget] = useState<Universe | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDescription, setEditDescription] = useState("");

    const fetchUniverses = async () => {
        const res = await fetch("/api/universes");
        const data = await res.json();
        setUniverses(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchUniverses();
    }, []);

    const handleCreate = async () => {
        if (!newTitle.trim()) return;
        const res = await offlineFetch("/api/universes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: newTitle,
                description: newDescription,
            }),
        });
        if (res.ok) {
            const universe = await res.json();
            setCreateOpen(false);
            setNewTitle("");
            setNewDescription("");
            router.push(`/universe/${universe.id}`);
        }
    };

    const openEdit = (universe: Universe) => {
        setEditTarget(universe);
        setEditTitle(universe.title);
        setEditDescription(universe.description);
    };

    const handleEdit = async () => {
        if (!editTarget || !editTitle.trim()) return;
        const res = await offlineFetch(`/api/universes/${editTarget.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: editTitle,
                description: editDescription,
            }),
        });
        if (res.ok) {
            setEditTarget(null);
            fetchUniverses();
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        await offlineFetch(`/api/universes/${deleteTarget.id}`, { method: "DELETE" });
        setDeleteTarget(null);
        fetchUniverses();
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    };

    return (
        <main className="min-h-screen">
            <div className="h-1 accent-gradient" />

            <div className="max-w-6xl mx-auto px-6 py-10">
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 mb-6 -ml-2 text-text-muted hover:text-text-primary"
                    onClick={() => router.push("/")}
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Dashboard
                </Button>

                <div className="flex items-end justify-between mb-10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
                                <Globe className="h-5 w-5 text-accent" />
                            </div>
                            <h1 className="text-3xl font-bold tracking-tight text-text-primary">
                                Universes
                            </h1>
                        </div>
                        <p className="text-text-muted ml-[52px]">
                            {universes.length > 0
                                ? `${universes.length} universe${universes.length !== 1 ? "s" : ""} · Shared world-building assets`
                                : "Manage your shared worlds"}
                        </p>
                    </div>
                    <Button onClick={() => setCreateOpen(true)} className="gap-2">
                        <Plus className="h-4 w-4" />
                        New Universe
                    </Button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : universes.length === 0 ? (
                    <div className="text-center py-32 animate-fade-in">
                        <div className="h-20 w-20 rounded-2xl bg-surface-raised border border-border flex items-center justify-center mx-auto mb-6">
                            <Globe className="h-9 w-9 text-accent" />
                        </div>
                        <h2 className="text-xl font-semibold text-text-primary mb-2">
                            Build your world
                        </h2>
                        <p className="text-text-muted mb-8 max-w-sm mx-auto">
                            Universes allow you to share characters, locations, and world-building elements across multiple projects.
                        </p>
                        <Button onClick={() => setCreateOpen(true)} size="lg" className="gap-2">
                            <Plus className="h-4 w-4" />
                            Create Universe
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fade-in">
                        {universes.map((universe, i) => (
                            <div
                                key={universe.id}
                                className="group glass-card p-5 cursor-pointer animate-slide-up"
                                style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards" }}
                                onClick={() => router.push(`/universe/${universe.id}`)}
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-text-primary truncate group-hover:text-accent transition-colors">
                                            {universe.title}
                                        </h3>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenuItem onClick={() => openEdit(universe)}>
                                                <Pencil className="h-4 w-4 mr-2" />
                                                Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setDeleteTarget(universe)} className="text-danger">
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                {universe.description && (
                                    <p className="text-sm text-text-secondary mt-1 line-clamp-2 leading-relaxed">
                                        {universe.description}
                                    </p>
                                )}

                                <div className="flex items-center gap-3 mt-4 text-xs text-text-muted">
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-overlay border border-border">
                                        <Link className="h-3 w-3" />
                                        <span>{universe.projectCount} Projects</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-overlay border border-border">
                                        <Sparkles className="h-3 w-3" />
                                        <span>{universe.worldObjectCount} Objects</span>
                                    </div>
                                    <span className="ml-auto">{formatDate(universe.updatedAt)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New Universe</DialogTitle>
                        <DialogDescription>Create a shared world for your projects.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <label className="text-sm font-medium text-text-secondary">Title *</label>
                            <Input
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="The Forgotten Realms"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-text-secondary">Description</label>
                            <Textarea
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                                placeholder="Briefly describe your world..."
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={!newTitle.trim()}>
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Universe</DialogTitle>
                        <DialogDescription>Update your universe details.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <label className="text-sm font-medium text-text-secondary">Title *</label>
                            <Input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="The Forgotten Realms"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-text-secondary">Description</label>
                            <Textarea
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                placeholder="Briefly describe your world..."
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditTarget(null)}>
                            Cancel
                        </Button>
                        <Button onClick={handleEdit} disabled={!editTitle.trim()}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete &ldquo;{deleteTarget?.title}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the universe and all its shared characters, locations,
                            and world elements. Projects linked to this universe will be unlinked but not deleted.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-danger hover:bg-danger-hover"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}
