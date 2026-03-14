"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
    Plus,
    ArrowLeft,
    Users,
    MapPin,
    Globe,
    Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { WorldObjectPanel } from "@/components/world-object-panel";
import { cn } from "@/lib/utils";
import type { Universe } from "@/lib/types";

type WorldObjectType = "CHARACTER" | "LOCATION" | "WORLD_ELEMENT";

const WORLD_TABS: { key: WorldObjectType; label: string; icon: typeof Users }[] = [
    { key: "CHARACTER", label: "Characters", icon: Users },
    { key: "LOCATION", label: "Locations", icon: MapPin },
    { key: "WORLD_ELEMENT", label: "World Elements", icon: Globe },
];

export default function UniversePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const universeId = resolvedParams.id;
    const router = useRouter();

    const [universe, setUniverse] = useState<Universe | null>(null);
    const [activeTab, setActiveTab] = useState<WorldObjectType>("CHARACTER");
    const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Dialogs
    const [addObjectOpen, setAddObjectOpen] = useState(false);
    const [newObjectName, setNewObjectName] = useState("");
    const [linkProjectOpen, setLinkProjectOpen] = useState(false);
    const [allProjects, setAllProjects] = useState<{ id: string, title: string }[]>([]);

    const fetchUniverse = async () => {
        const res = await fetch(`/api/universes/${universeId}`);
        if (res.ok) {
            setUniverse(await res.json());
        }
        setLoading(false);
    };

    const fetchProjects = async () => {
        const res = await fetch("/api/projects");
        if (res.ok) {
            const data = await res.json();
            setAllProjects(data.projects || []);
        }
    };

    useEffect(() => {
        fetchUniverse();
    }, [universeId]);

    const handleAddObject = async () => {
        if (!newObjectName.trim()) return;
        const res = await fetch(`/api/universes/${universeId}/world-objects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newObjectName, type: activeTab }),
        });
        if (res.ok) {
            setAddObjectOpen(false);
            setNewObjectName("");
            fetchUniverse();
        }
    };

    const filteredObjects = universe?.worldObjects?.filter(o => o.type === activeTab) || [];

    if (loading || !universe) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col">
            <div className="h-0.5 accent-gradient flex-shrink-0" />

            <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface-raised flex-shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/universe")}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Globe className="h-4 w-4 text-accent flex-shrink-0" />
                    <h1 className="font-semibold text-text-primary truncate">{universe.title}</h1>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted hidden sm:inline">
                        {universe.projects?.length || 0} Linked Projects
                    </span>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => { fetchProjects(); setLinkProjectOpen(true); }}>
                        <LinkIcon className="h-3.5 w-3.5" />
                        Link Project
                    </Button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <aside className="w-80 border-r border-border bg-surface-raised flex flex-col flex-shrink-0">
                    <div className="flex items-center gap-1 px-2 py-2 border-b border-border">
                        {WORLD_TABS.map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                onClick={() => { setActiveTab(key); setSelectedObjectId(null); }}
                                className={cn(
                                    "flex-1 px-2 py-2 rounded-md transition-all flex flex-col items-center gap-1 justify-center",
                                    activeTab === key
                                        ? "bg-accent/15 text-accent"
                                        : "text-text-muted hover:text-text-secondary"
                                )}
                                title={label}
                            >
                                <Icon className="h-4 w-4" />
                                <span className="text-[10px] font-medium uppercase tracking-wider">{label.slice(0, 4)}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <div className="flex items-center justify-between px-3 py-2">
                            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{activeTab}S</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddObjectOpen(true)}>
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>

                        {filteredObjects.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-text-muted">
                                <p>No {activeTab.toLowerCase()}s yet.</p>
                            </div>
                        ) : (
                            <div className="px-2 space-y-0.5">
                                {filteredObjects.map((obj) => (
                                    <button
                                        key={obj.id}
                                        className={cn(
                                            "w-full text-left px-3 py-2 rounded-lg text-sm transition-all",
                                            selectedObjectId === obj.id
                                                ? "bg-accent/10 text-accent font-medium"
                                                : "text-text-secondary hover:bg-surface-overlay/60 hover:text-text-primary"
                                        )}
                                        onClick={() => setSelectedObjectId(obj.id)}
                                    >
                                        {obj.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>

                {/* Main */}
                <main className="flex-1 overflow-hidden bg-surface-sunken/30">
                    {selectedObjectId ? (
                        <WorldObjectPanel
                            objectId={selectedObjectId}
                            onClose={() => setSelectedObjectId(null)}
                            onDeleted={() => { setSelectedObjectId(null); fetchUniverse(); }}
                            onUpdated={fetchUniverse}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-text-muted animate-fade-in">
                            <div className="text-center">
                                <div className="h-16 w-16 rounded-2xl bg-surface-raised border border-border flex items-center justify-center mx-auto mb-4">
                                    <Globe className="h-7 w-7 text-accent/50" />
                                </div>
                                <h3 className="text-lg font-semibold text-text-primary mb-1">Explore {universe.title}</h3>
                                <p className="text-sm max-w-xs mx-auto">Select a world object to view its details and evolution across time.</p>

                                {universe.projects && universe.projects.length > 0 && (
                                    <div className="mt-8 pt-8 border-t border-border/50">
                                        <p className="text-xs uppercase tracking-widest text-text-muted mb-4 font-medium">Linked Projects</p>
                                        <div className="flex flex-wrap justify-center gap-2">
                                            {universe.projects.map(p => (
                                                <Button key={p.id} variant="outline" size="sm" className="h-7 text-xs bg-surface-raised" onClick={() => router.push(`/project/${p.id}`)}>
                                                    {p.title}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </main>
            </div>

            <Dialog open={addObjectOpen} onOpenChange={setAddObjectOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add {activeTab.toLowerCase()}</DialogTitle>
                    </DialogHeader>
                    <div className="py-2">
                        <Input
                            value={newObjectName}
                            onChange={(e) => setNewObjectName(e.target.value)}
                            placeholder="Name"
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && handleAddObject()}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddObjectOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddObject} disabled={!newObjectName.trim()}>Add</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={linkProjectOpen} onOpenChange={setLinkProjectOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Link Project</DialogTitle>
                        <DialogDescription>Choose a project to link to this universe.</DialogDescription>
                    </DialogHeader>
                    <div className="py-2 max-h-[300px] overflow-y-auto space-y-1">
                        {allProjects.filter(p => p.id !== universeId).map(p => ( // Filter projects not in this universe (simplified check)
                            <button
                                key={p.id}
                                className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-overlay text-sm flex items-center justify-between"
                                onClick={async () => {
                                    await fetch(`/api/projects/${p.id}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ universeId })
                                    });
                                    setLinkProjectOpen(false);
                                    fetchUniverse();
                                }}
                            >
                                {p.title}
                                <Plus className="h-3 w-3" />
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
