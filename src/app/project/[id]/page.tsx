"use client";

import { useEffect, useState, useCallback, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Settings,
  Users,
  MapPin,
  GitBranch,
  Globe,
  StickyNote,
  PenLine,
  Search,
  Activity,
  Network,
  Menu,
  X as XIcon,
  MessageSquare,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { offlineFetch } from "@/lib/offline/sync-queue";
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
import dynamic from "next/dynamic";
import { OutlineTree } from "@/components/outline-tree";
import { ErrorBoundary } from "@/components/error-boundary";

const SceneEditor = dynamic(() => import("@/components/scene-editor").then(m => m.SceneEditor), {
  loading: () => <div className="flex items-center justify-center h-full"><div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>,
});
const StoryObjectPanel = dynamic(() => import("@/components/story-object-panel").then(m => m.StoryObjectPanel));
const SearchPanel = dynamic(() => import("@/components/search-panel").then(m => m.SearchPanel));
const SceneAwareChatPanel = dynamic(() => import("@/components/scene-aware-chat-panel").then(m => m.SceneAwareChatPanel));
const ManuscriptAiPanel = dynamic(() => import("@/components/manuscript-ai-panel").then(m => m.ManuscriptAiPanel));
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { PROJECT_TYPE_LABELS } from "@/lib/constants";
import { Breadcrumbs } from "@/components/breadcrumbs";
import type { Project, OutlineNode, PlotlineIndicator, StoryObject, StoryObjectType, SceneStatus } from "@/lib/types";

type SidebarTab = "outline" | "characters" | "locations" | "plotlines" | "world" | "notes" | "ai-chat";

function mergeIndicators(
  nodes: OutlineNode[],
  plotMap: Map<string, PlotlineIndicator[]>
): OutlineNode[] {
  return nodes.map((node) => ({
    ...node,
    plotIndicators: node.type === "SCENE" ? (plotMap.get(node.id) ?? []) : undefined,
    children: mergeIndicators(node.children, plotMap),
  }));
}

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
  const [selectedObjectSource, setSelectedObjectSource] = useState<"project" | "universe">("project");
  const [activeTab, setActiveTab] = useState<SidebarTab>("outline");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
  const [showSearch, setShowSearch] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [addObjectName, setAddObjectName] = useState("");
  const [showManuscriptAI, setShowManuscriptAI] = useState(false);

  // Data fetching
  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`);
    if (res.ok) setProject(await res.json());
  }, [projectId]);

  const fetchOutline = useCallback(async () => {
    const [nodesRes, plotRes] = await Promise.all([
      fetch(`/api/projects/${projectId}/nodes`),
      fetch(`/api/projects/${projectId}/plot-thread-status`),
    ]);
    if (!nodesRes.ok) return;
    const data = await nodesRes.json();
    let tree: OutlineNode[] = data.tree || [];

    if (plotRes.ok) {
      const plotStatus: { sceneId: string; indicators: PlotlineIndicator[] }[] = await plotRes.json();
      const plotMap = new Map(plotStatus.map((s) => [s.sceneId, s.indicators]));
      tree = mergeIndicators(tree, plotMap);
    }

    setOutline(tree);
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
    await offlineFetch(`/api/projects/${projectId}/nodes`, {
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
    await offlineFetch(`/api/nodes/${renameNodeId}`, {
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
    await offlineFetch(`/api/nodes/${deleteNodeId}`, { method: "DELETE" });
    setDeleteDialogOpen(false);
    if (selectedNodeId === deleteNodeId) setSelectedNodeId(null);
    fetchOutline();
  };

  const handleAddStoryObject = async () => {
    if (!addObjectName.trim()) return;
    await offlineFetch(`/api/projects/${projectId}/story-objects`, {
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

  const handleMoveNode = async (nodeId: string, newParentId: string | null, newIndex: number) => {
    // Optimistic: re-fetch after server confirms
    const res = await offlineFetch("/api/nodes/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId, newParentId, newIndex }),
    });
    if (res.ok) {
      fetchOutline();
    }
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

  // Build flat scene list for the timeline strip (derived from outline)
  const timelineScenes = useMemo(() => {
    const scenes: { id: string; title: string; status: string; orderIndex: number; chapterTitle?: string }[] = [];
    function collectScenes(nodes: OutlineNode[], chapterTitle?: string) {
      for (const n of nodes) {
        if (n.type === "SCENE") {
          scenes.push({ id: n.id, title: n.title, status: n.status, orderIndex: n.orderIndex, chapterTitle });
        } else {
          collectScenes(n.children, n.type === "CHAPTER" ? n.title : chapterTitle);
        }
      }
    }
    collectScenes(outline);
    return scenes;
  }, [outline]);

  // Filter story objects by active tab
  const activeStoryTab = STORY_TABS.find((t) => t.key === activeTab);
  const filteredObjects = activeStoryTab
    ? storyObjects.filter((o) => o.type === activeStoryTab.type)
    : [];

  const totalWordCount = project?.wordCount || 0;

  // Map story object types to sidebar tabs
  const OBJECT_TYPE_TO_TAB: Record<string, SidebarTab> = {
    CHARACTER: "characters",
    LOCATION: "locations",
    PLOTLINE: "plotlines",
    WORLD_ELEMENT: "world",
    NOTE: "notes",
  };

  const handleSearchSelectScene = (sceneId: string) => {
    setSelectedNodeId(sceneId);
    setSelectedObjectId(null);
    setActiveTab("outline");
    setSidebarOpen(false);
  };

  const handleSearchSelectObject = (objectId: string, objectType: string) => {
    setSelectedObjectId(objectId);
    setSelectedObjectSource("project");
    setSelectedNodeId(null);
    const tab = OBJECT_TYPE_TO_TAB[objectType];
    if (tab) setActiveTab(tab);
    setSidebarOpen(false);
  };

  // Keyboard shortcuts: Cmd+K search, Escape close, Cmd+/ sidebar
  const keyboardActions = useMemo(() => ({
    onToggleSearch: () => setShowSearch((v) => !v),
    onClosePanel: () => {
      if (showSearch) { setShowSearch(false); return; }
      if (selectedObjectId) { setSelectedObjectId(null); return; }
      if (sidebarOpen) { setSidebarOpen(false); return; }
    },
    onToggleSidebar: () => {
      setSidebarHidden((v) => !v);
      if (sidebarHidden) setSidebarOpen(true);
    },
  }), [showSearch, selectedObjectId, sidebarOpen, sidebarHidden]);
  useKeyboardShortcuts(keyboardActions);

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
          className="h-8 w-8 md:hidden text-text-muted hover:text-text-primary"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar menu"
        >
          <Menu className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Breadcrumbs
            items={[
              { label: project.title, href: selectedNode ? `/project/${projectId}` : undefined },
              ...(selectedNode ? [{ label: selectedNode.title }] : []),
            ]}
          />
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
          onClick={() => setShowSearch(!showSearch)}
          aria-label="Search project"
          aria-expanded={showSearch}
        >
          <Search className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push(`/project/${projectId}/timeline`)}
          aria-label="Timeline view"
        >
          <Activity className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push(`/project/${projectId}/graph`)}
          aria-label="Story graph"
        >
          <Network className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", showManuscriptAI && "text-accent bg-accent/10")}
          onClick={() => setShowManuscriptAI(!showManuscriptAI)}
          aria-label="Manuscript AI analysis"
          aria-pressed={showManuscriptAI}
          title="Manuscript AI"
        >
          <BookOpen className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push(`/project/${projectId}/settings`)}
          aria-label="Project settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <ThemeToggle />
        <UserMenu />
      </header>

      {/* Search panel */}
      {showSearch && (
        <SearchPanel
          projectId={projectId}
          onSelectScene={handleSearchSelectScene}
          onSelectObject={handleSearchSelectObject}
          onClose={() => setShowSearch(false)}
        />
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile sidebar overlay mask */}
        {sidebarOpen && (
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={cn(
          "absolute inset-y-0 left-0 z-50 w-80 border-r border-border bg-surface-raised flex flex-col flex-shrink-0 transition-transform duration-200 ease-in-out",
          sidebarHidden ? "hidden" : "md:relative md:translate-x-0",
          !sidebarHidden && (sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full")
        )}>
          {/* Mobile close button */}
          <div className="md:hidden flex items-center justify-between p-2 border-b border-border bg-surface">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted ml-2">Menu</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted hover:text-text-primary" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar menu">
              <XIcon className="h-4 w-4" />
            </Button>
          </div>

          {/* Sidebar tabs */}
          <div className="flex items-center gap-0.5 px-2 py-2 border-b border-border overflow-x-auto" role="tablist" aria-label="Sidebar navigation">
            <button
              role="tab"
              aria-selected={activeTab === "outline"}
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
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => { setActiveTab(key); setSelectedNodeId(null); setSelectedObjectId(null); }}
                className={cn(
                  "px-2 py-1.5 rounded-md transition-all flex items-center gap-1 whitespace-nowrap",
                  activeTab === key
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted hover:text-text-secondary hover:bg-surface-overlay/50"
                )}
                aria-label={label}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="text-xs font-medium hidden lg:inline">{label}</span>
              </button>
            ))}
            <button
              role="tab"
              aria-selected={activeTab === "ai-chat"}
              onClick={() => { setActiveTab("ai-chat"); setSelectedNodeId(null); setSelectedObjectId(null); }}
              className={cn(
                "px-2 py-1.5 rounded-md transition-all flex items-center gap-1 whitespace-nowrap",
                activeTab === "ai-chat"
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:text-text-secondary hover:bg-surface-overlay/50"
              )}
              aria-label="AI Chat"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="text-xs font-medium hidden lg:inline">AI</span>
            </button>
          </div>

          {/* Sidebar content */}
          <div className="flex-1 overflow-y-auto flex flex-col">
            {activeTab === "ai-chat" ? (
              <ErrorBoundary fallbackTitle="Chat panel crashed">
                <SceneAwareChatPanel
                  projectId={projectId}
                  sceneId={selectedNode?.type === "SCENE" ? selectedNode.id : undefined}
                  sceneStatus={selectedNode?.type === "SCENE" ? (selectedNode.status as SceneStatus) : undefined}
                  sceneTitle={selectedNode?.type === "SCENE" ? selectedNode.title : undefined}
                  sceneContext={selectedNode?.type === "SCENE" ? selectedNode.title : undefined}
                />
              </ErrorBoundary>
            ) : activeTab === "outline" ? (
              <>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Structure</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => openAddNode(null, "CHAPTER")}
                    aria-label="Add chapter"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <ErrorBoundary fallbackTitle="Outline crashed">
                  <OutlineTree
                    nodes={outline}
                    projectType={project.projectType}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={(id) => { setSelectedNodeId(id); setSelectedObjectId(null); setSidebarOpen(false); }}
                    onAddNode={openAddNode}
                    onRenameNode={openRename}
                    onDeleteNode={openDelete}
                    onMoveNode={handleMoveNode}
                  />
                </ErrorBoundary>
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
                    aria-label={`Add ${activeStoryTab?.label.slice(0, -1).toLowerCase()}`}
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
                          setSelectedObjectSource(obj.source || "project");
                          setSelectedNodeId(null);
                          setSidebarOpen(false);
                        }}
                      >
                        <span className="flex items-center gap-1.5">
                          {obj.name}
                          {obj.source === "universe" && (
                            <span title="Universe entity">
                              <Globe className="h-3 w-3 text-accent/60 flex-shrink-0" />
                            </span>
                          )}
                          {obj.role && (
                            <span className="text-xs text-text-muted">{obj.role}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main id="main-content" className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-hidden">
            {selectedObjectId ? (
              <ErrorBoundary fallbackTitle="Story object panel crashed">
                <StoryObjectPanel
                  objectId={selectedObjectId}
                  source={selectedObjectSource}
                  onClose={() => setSelectedObjectId(null)}
                  onDeleted={() => {
                    setSelectedObjectId(null);
                    fetchStoryObjects();
                  }}
                  onUpdated={fetchStoryObjects}
                />
              </ErrorBoundary>
            ) : selectedNode && selectedNode.type === "SCENE" ? (
              <ErrorBoundary fallbackTitle="Scene editor crashed">
                <SceneEditor
                  key={selectedNode.id}
                  node={selectedNode}
                  projectId={projectId}
                  projectTitle={project?.title}
                  onNodeUpdated={() => { fetchOutline(); fetchProject(); }}
                  timelineScenes={timelineScenes}
                  linkedCharacters={storyObjects.filter((o) => o.type === "CHARACTER")}
                />
              </ErrorBoundary>
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
          </div>

          {/* Manuscript AI panel (right rail) */}
          {showManuscriptAI && (
            <div className="w-80 border-l border-border flex-shrink-0 overflow-hidden">
              <ErrorBoundary fallbackTitle="Manuscript AI crashed">
                <ManuscriptAiPanel
                  projectId={projectId}
                  onClose={() => setShowManuscriptAI(false)}
                />
              </ErrorBoundary>
            </div>
          )}
        </main>
      </div>

      {/* Add Node Dialog */}
      <Dialog open={addNodeDialogOpen} onOpenChange={setAddNodeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {PROJECT_TYPE_LABELS[project.projectType][addNodeType]}
            </DialogTitle>
            <DialogDescription>
              Enter a title for the new {
                PROJECT_TYPE_LABELS[project.projectType][addNodeType] || addNodeType.toLowerCase()
              }.
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
