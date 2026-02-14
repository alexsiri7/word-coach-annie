"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Settings,
  ArrowLeft,
  Users,
  MapPin,
  GitBranch,
  Globe,
  StickyNote,
  PenLine,
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
import { OutlineTree } from "@/components/outline-tree";
import { SceneEditor } from "@/components/scene-editor";
import { StoryObjectPanel } from "@/components/story-object-panel";
import { cn } from "@/lib/utils";
import type { Project, OutlineNode, StoryObject, StoryObjectType } from "@/lib/types";

type SidebarTab = "outline" | "characters" | "locations" | "plotlines" | "world" | "notes";

const STORY_TABS: { key: SidebarTab; type: StoryObjectType; label: string; icon: typeof Users }[] = [
  { key: "characters", type: "CHARACTER", label: "Characters", icon: Users },
  { key: "locations", type: "LOCATION", label: "Locations", icon: MapPin },
  { key: "plotlines", type: "PLOTLINE", label: "Plotlines", icon: GitBranch },
  { key: "world", type: "WORLD_ELEMENT", label: "World", icon: Globe },
  { key: "notes", type: "NOTE", label: "Notes", icon: StickyNote },
];

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [storyObjects, setStoryObjects] = useState<StoryObject[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>("outline");

  // Dialogs
  const [addNodeDialogOpen, setAddNodeDialogOpen] = useState(false);
  const [addNodeParentId, setAddNodeParentId] = useState<string | null>(null);
  const [addNodeType, setAddNodeType] = useState<"CHAPTER" | "SCENE">("CHAPTER");
  const [addNodeTitle, setAddNodeTitle] = useState("");

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameNodeId, setRenameNodeId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteNodeId, setDeleteNodeId] = useState<string | null>(null);
  const [deleteNodeTitle, setDeleteNodeTitle] = useState("");

  const [addObjectDialogOpen, setAddObjectDialogOpen] = useState(false);
  const [addObjectType, setAddObjectType] = useState<StoryObjectType>("CHARACTER");
  const [addObjectName, setAddObjectName] = useState("");

  // Data fetching
  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`);
    if (res.ok) setProject(await res.json());
  }, [projectId]);

  const fetchOutline = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/nodes`);
    if (res.ok) {
      const data = await res.json();
      setOutline(data.tree || []);
    }
  }, [projectId]);

  const fetchStoryObjects = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/story-objects`);
    if (res.ok) {
      const data = await res.json();
      setStoryObjects(data.data || []);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    fetchOutline();
    fetchStoryObjects();
  }, [fetchProject, fetchOutline, fetchStoryObjects]);

  // Handlers
  const handleAddNode = async () => {
    if (!addNodeTitle.trim()) return;
    await fetch(`/api/projects/${projectId}/nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: addNodeTitle,
        type: addNodeType,
        parentId: addNodeParentId,
      }),
    });
    setAddNodeDialogOpen(false);
    setAddNodeTitle("");
    fetchOutline();
  };

  const handleRenameNode = async () => {
    if (!renameNodeId || !renameTitle.trim()) return;
    await fetch(`/api/nodes/${renameNodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameTitle }),
    });
    setRenameDialogOpen(false);
    setRenameTitle("");
    fetchOutline();
  };

  const handleDeleteNode = async () => {
    if (!deleteNodeId) return;
    await fetch(`/api/nodes/${deleteNodeId}`, { method: "DELETE" });
    setDeleteDialogOpen(false);
    if (selectedNodeId === deleteNodeId) setSelectedNodeId(null);
    fetchOutline();
  };

  const handleAddStoryObject = async () => {
    if (!addObjectName.trim()) return;
    await fetch(`/api/projects/${projectId}/story-objects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: addObjectType, name: addObjectName }),
    });
    setAddObjectDialogOpen(false);
    setAddObjectName("");
    fetchStoryObjects();
  };

  const openAddNode = (parentId: string | null, type: "CHAPTER" | "SCENE") => {
    setAddNodeParentId(parentId);
    setAddNodeType(type);
    setAddNodeTitle("");
    setAddNodeDialogOpen(true);
  };

  const openRename = (nodeId: string, currentTitle: string) => {
    setRenameNodeId(nodeId);
    setRenameTitle(currentTitle);
    setRenameDialogOpen(true);
  };

  const openDelete = (nodeId: string, title: string) => {
    setDeleteNodeId(nodeId);
    setDeleteNodeTitle(title);
    setDeleteDialogOpen(true);
  };

  // Find selected node recursively
  const findNode = (nodes: OutlineNode[], id: string): OutlineNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = findNode(n.children, id);
      if (found) return found;
    }
    return null;
  };

  const selectedNode = selectedNodeId ? findNode(outline, selectedNodeId) : null;

  // Filter story objects by active tab
  const activeStoryTab = STORY_TABS.find((t) => t.key === activeTab);
  const filteredObjects = activeStoryTab
    ? storyObjects.filter((o) => o.type === activeStoryTab.type)
    : [];

  const totalWordCount = project?.wordCount || 0;

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Top accent line */}
      <div className="h-0.5 accent-gradient flex-shrink-0" />

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface-raised flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push("/")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <PenLine className="h-4 w-4 text-accent flex-shrink-0" />
          <h1 className="font-semibold text-text-primary truncate">{project.title}</h1>
          {project.genre && (
            <span className="tag-pill hidden sm:inline">{project.genre}</span>
          )}
        </div>
        <span className="text-xs text-text-muted tabular-nums hidden sm:block">
          {totalWordCount.toLocaleString()} words
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push(`/project/${projectId}/settings`)}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r border-border bg-surface-raised flex flex-col flex-shrink-0">
          {/* Sidebar tabs */}
          <div className="flex items-center gap-0.5 px-2 py-2 border-b border-border overflow-x-auto">
            <button
              onClick={() => { setActiveTab("outline"); setSelectedObjectId(null); }}
              className={cn(
                "px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                activeTab === "outline"
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:text-text-secondary hover:bg-surface-overlay/50"
              )}
            >
              Outline
            </button>
            {STORY_TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setActiveTab(key); setSelectedNodeId(null); setSelectedObjectId(null); }}
                className={cn(
                  "px-2 py-1.5 rounded-md transition-all flex items-center gap-1 whitespace-nowrap",
                  activeTab === key
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted hover:text-text-secondary hover:bg-surface-overlay/50"
                )}
                title={label}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs font-medium hidden lg:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Sidebar content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "outline" ? (
              <>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Structure</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => openAddNode(null, "CHAPTER")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <OutlineTree
                  nodes={outline}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={(id) => { setSelectedNodeId(id); setSelectedObjectId(null); }}
                  onAddNode={openAddNode}
                  onRenameNode={openRename}
                  onDeleteNode={openDelete}
                />
              </>
            ) : (
              <>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                    {activeStoryTab?.label}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setAddObjectType(activeStoryTab!.type);
                      setAddObjectName("");
                      setAddObjectDialogOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {filteredObjects.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-text-muted">
                    <p>No {activeStoryTab?.label.toLowerCase()} yet.</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setAddObjectType(activeStoryTab!.type);
                        setAddObjectName("");
                        setAddObjectDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add {activeStoryTab?.label.slice(0, -1)}
                    </Button>
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
                        onClick={() => {
                          setSelectedObjectId(obj.id);
                          setSelectedNodeId(null);
                        }}
                      >
                        {obj.name}
                        {obj.role && (
                          <span className="ml-2 text-xs text-text-muted">{obj.role}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-hidden">
          {selectedObjectId ? (
            <StoryObjectPanel
              objectId={selectedObjectId}
              onClose={() => setSelectedObjectId(null)}
              onDeleted={() => {
                setSelectedObjectId(null);
                fetchStoryObjects();
              }}
              onUpdated={fetchStoryObjects}
            />
          ) : selectedNode && selectedNode.type === "SCENE" ? (
            <SceneEditor
              key={selectedNode.id}
              node={selectedNode as any}
              projectId={projectId}
              onNodeUpdated={() => { fetchOutline(); fetchProject(); }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted animate-fade-in">
              <div className="text-center">
                <div className="h-16 w-16 rounded-2xl bg-surface-raised border border-border flex items-center justify-center mx-auto mb-4">
                  <PenLine className="h-7 w-7 text-accent/50" />
                </div>
                <p className="text-sm">
                  {outline.length === 0
                    ? "Create a chapter to get started"
                    : "Select a scene to start writing"}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add Node Dialog */}
      <Dialog open={addNodeDialogOpen} onOpenChange={setAddNodeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {addNodeType === "CHAPTER" ? "Chapter" : "Scene"}
            </DialogTitle>
            <DialogDescription>
              Enter a title for the new {addNodeType.toLowerCase()}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={addNodeTitle}
              onChange={(e) => setAddNodeTitle(e.target.value)}
              placeholder={addNodeType === "CHAPTER" ? "Chapter title" : "Scene title"}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAddNode()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddNodeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddNode} disabled={!addNodeTitle.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleRenameNode()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameNode} disabled={!renameTitle.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteNodeTitle}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this item and all its children. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNode}
              className="bg-danger hover:bg-danger-hover"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Story Object Dialog */}
      <Dialog open={addObjectDialogOpen} onOpenChange={setAddObjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {activeStoryTab?.label.slice(0, -1)}
            </DialogTitle>
            <DialogDescription>
              Enter a name for the new {activeStoryTab?.label.toLowerCase().slice(0, -1)}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={addObjectName}
              onChange={(e) => setAddObjectName(e.target.value)}
              placeholder="Name"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAddStoryObject()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddObjectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddStoryObject} disabled={!addObjectName.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
