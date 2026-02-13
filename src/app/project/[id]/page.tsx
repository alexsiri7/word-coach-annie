"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Settings,
  Users,
  MapPin,
  GitBranch,
  Globe,
  StickyNote,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import type { Project, OutlineNode, StructureNode, StoryObjectType } from "@/lib/types";

type SidebarTab = "outline" | "characters" | "locations" | "plotlines" | "world" | "notes";

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<StructureNode | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>("outline");
  const [totalWordCount, setTotalWordCount] = useState(0);

  // Dialog states
  const [addNodeDialog, setAddNodeDialog] = useState<{
    open: boolean;
    parentId: string | null;
    type: "CHAPTER" | "SCENE";
  }>({ open: false, parentId: null, type: "CHAPTER" });
  const [addNodeTitle, setAddNodeTitle] = useState("");

  const [renameDialog, setRenameDialog] = useState<{
    open: boolean;
    nodeId: string;
    title: string;
  }>({ open: false, nodeId: "", title: "" });

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    nodeId: string;
    title: string;
  }>({ open: false, nodeId: "", title: "" });

  // Story objects
  const [storyObjects, setStoryObjects] = useState<Record<string, Array<{ id: string; name: string; type: string }>>>({
    CHARACTER: [],
    LOCATION: [],
    PLOTLINE: [],
    WORLD_ELEMENT: [],
    NOTE: [],
  });

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`);
    if (res.ok) {
      setProject(await res.json());
    } else {
      router.push("/");
    }
  }, [projectId, router]);

  const fetchOutline = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/outline`);
    if (res.ok) {
      const data = await res.json();
      setOutline(data);
      // Calculate total word count
      let total = 0;
      const countWords = (nodes: OutlineNode[]) => {
        for (const node of nodes) {
          if (node.type === "SCENE" && node.wordCount) total += node.wordCount;
          if (node.children) countWords(node.children);
        }
      };
      countWords(data);
      setTotalWordCount(total);
    }
  }, [projectId]);

  const fetchStoryObjects = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/story-objects?limit=200`);
    if (res.ok) {
      const data = await res.json();
      const grouped: Record<string, Array<{ id: string; name: string; type: string }>> = {
        CHARACTER: [],
        LOCATION: [],
        PLOTLINE: [],
        WORLD_ELEMENT: [],
        NOTE: [],
      };
      for (const obj of data.storyObjects || data) {
        if (grouped[obj.type]) {
          grouped[obj.type].push(obj);
        }
      }
      setStoryObjects(grouped);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    fetchOutline();
    fetchStoryObjects();
  }, [fetchProject, fetchOutline, fetchStoryObjects]);

  // Load selected node details
  useEffect(() => {
    if (selectedNodeId) {
      fetch(`/api/nodes/${selectedNodeId}`)
        .then((res) => res.json())
        .then((data) => setSelectedNode(data));
    } else {
      setSelectedNode(null);
    }
  }, [selectedNodeId]);

  const handleAddNode = async () => {
    if (!addNodeTitle.trim()) return;
    await fetch(`/api/projects/${projectId}/nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: addNodeDialog.type,
        title: addNodeTitle,
        parentId: addNodeDialog.parentId,
      }),
    });
    setAddNodeDialog({ open: false, parentId: null, type: "CHAPTER" });
    setAddNodeTitle("");
    fetchOutline();
  };

  const handleRename = async () => {
    if (!renameDialog.title.trim()) return;
    await fetch(`/api/nodes/${renameDialog.nodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameDialog.title }),
    });
    setRenameDialog({ open: false, nodeId: "", title: "" });
    fetchOutline();
  };

  const handleDelete = async () => {
    await fetch(`/api/nodes/${deleteDialog.nodeId}`, { method: "DELETE" });
    if (selectedNodeId === deleteDialog.nodeId) {
      setSelectedNodeId(null);
    }
    setDeleteDialog({ open: false, nodeId: "", title: "" });
    fetchOutline();
  };

  const handleAddStoryObject = async (type: StoryObjectType) => {
    const name = prompt(`New ${type.toLowerCase().replace("_", " ")} name:`);
    if (!name?.trim()) return;
    await fetch(`/api/projects/${projectId}/story-objects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name }),
    });
    fetchStoryObjects();
  };

  const sidebarTabs: { key: SidebarTab; label: string; icon: React.ReactNode }[] = [
    { key: "outline", label: "Outline", icon: null },
    { key: "characters", label: "Characters", icon: <Users className="h-4 w-4" /> },
    { key: "locations", label: "Locations", icon: <MapPin className="h-4 w-4" /> },
    { key: "plotlines", label: "Plotlines", icon: <GitBranch className="h-4 w-4" /> },
    { key: "world", label: "World", icon: <Globe className="h-4 w-4" /> },
    { key: "notes", label: "Notes", icon: <StickyNote className="h-4 w-4" /> },
  ];

  const storyObjectTypeMap: Record<string, StoryObjectType> = {
    characters: "CHARACTER",
    locations: "LOCATION",
    plotlines: "PLOTLINE",
    world: "WORLD_ELEMENT",
    notes: "NOTE",
  };

  if (!project) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-72 border-r bg-white flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-sm truncate">{project.title}</h2>
              <p className="text-xs text-gray-400">{totalWordCount.toLocaleString()} words</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push(`/project/${projectId}/settings`)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Sidebar tabs */}
        <div className="flex border-b overflow-x-auto">
          {sidebarTabs.map((tab) => (
            <button
              key={tab.key}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap ${
                activeTab === tab.key
                  ? "text-gray-900 border-b-2 border-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon ? (
                <span className="flex items-center gap-1">{tab.icon}</span>
              ) : (
                tab.label
              )}
            </button>
          ))}
        </div>

        {/* Sidebar content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "outline" ? (
            <>
              <div className="px-3 py-2 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    setAddNodeDialog({ open: true, parentId: null, type: "CHAPTER" })
                  }
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Chapter
                </Button>
              </div>
              <OutlineTree
                nodes={outline}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                onAddNode={(parentId, type) => {
                  setAddNodeDialog({ open: true, parentId, type });
                }}
                onRenameNode={(nodeId, title) =>
                  setRenameDialog({ open: true, nodeId, title })
                }
                onDeleteNode={(nodeId, title) =>
                  setDeleteDialog({ open: true, nodeId, title })
                }
              />
            </>
          ) : (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleAddStoryObject(storyObjectTypeMap[activeTab])}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              {storyObjects[storyObjectTypeMap[activeTab]]?.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">
                  No {activeTab} yet
                </p>
              ) : (
                <div className="space-y-1">
                  {storyObjects[storyObjectTypeMap[activeTab]]?.map((obj) => (
                    <div
                      key={obj.id}
                      className="px-2 py-1.5 text-sm rounded hover:bg-gray-100 cursor-pointer"
                    >
                      {obj.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {selectedNode && selectedNode.type === "SCENE" ? (
          <>
            <div className="px-6 py-3 border-b bg-white">
              <h1 className="text-lg font-semibold">{selectedNode.title}</h1>
            </div>
            <div className="flex-1 overflow-hidden">
              <SceneEditor
                key={selectedNode.id}
                node={selectedNode}
                projectId={projectId}
                onNodeUpdated={() => {
                  fetchOutline();
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-lg mb-2">Select a scene to start writing</p>
              <p className="text-sm">Choose a scene from the outline, or create a new one.</p>
            </div>
          </div>
        )}
      </div>

      {/* Add Node Dialog */}
      <Dialog
        open={addNodeDialog.open}
        onOpenChange={(open) =>
          setAddNodeDialog({ ...addNodeDialog, open })
        }
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              New {addNodeDialog.type === "CHAPTER" ? "Chapter" : "Scene"}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={addNodeTitle}
            onChange={(e) => setAddNodeTitle(e.target.value)}
            placeholder={
              addNodeDialog.type === "CHAPTER" ? "Chapter title" : "Scene title"
            }
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAddNode()}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setAddNodeDialog({ open: false, parentId: null, type: "CHAPTER" })
              }
            >
              Cancel
            </Button>
            <Button onClick={handleAddNode} disabled={!addNodeTitle.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog
        open={renameDialog.open}
        onOpenChange={(open) => setRenameDialog({ ...renameDialog, open })}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <Input
            value={renameDialog.title}
            onChange={(e) =>
              setRenameDialog({ ...renameDialog, title: e.target.value })
            }
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setRenameDialog({ open: false, nodeId: "", title: "" })
              }
            >
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!renameDialog.title.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          !open && setDeleteDialog({ open: false, nodeId: "", title: "" })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteDialog.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this item and all its children. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
