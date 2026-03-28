"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  FolderOpen,
  Plus,
  MoreVertical,
  Trash2,
  Pencil,
  BookOpen,
  Maximize,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { OutlineNode, PlotlineIndicator, SceneStatus, ProjectType } from "@/lib/types";
import { PROJECT_TYPE_LABELS } from "@/lib/constants";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface OutlineTreeProps {
  nodes: OutlineNode[];
  projectType: ProjectType;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onAddNode: (parentId: string | null, type: "CHAPTER" | "SCENE") => void;
  onRenameNode: (nodeId: string, currentTitle: string) => void;
  onDeleteNode: (nodeId: string, title: string) => void;
  onMoveNode?: (nodeId: string, newParentId: string | null, newIndex: number) => void;
}

const STATUS_LABELS: Record<SceneStatus, string> = {
  OUTLINE: "Outline",
  DRAFT: "Draft",
  REVISED: "Revised",
  FINAL: "Final",
};

function StatusDot({ status }: { status: SceneStatus }) {
  const colors: Record<SceneStatus, string> = {
    OUTLINE: "bg-text-muted/50",
    DRAFT: "bg-warning",
    REVISED: "bg-accent",
    FINAL: "bg-success",
  };
  return (
    <span
      className={cn("inline-block w-2 h-2 rounded-full flex-shrink-0", colors[status])}
      role="img"
      aria-label={`Status: ${STATUS_LABELS[status]}`}
    />
  );
}

function PlotThreadDots({ indicators }: { indicators: PlotlineIndicator[] }) {
  const active = indicators.filter((i) => i.status !== "dormant");
  const dormant = indicators.filter((i) => i.status === "dormant");

  return (
    <TooltipProvider>
      <span className="flex items-center gap-0.5 flex-shrink-0">
        {active.map((ind) => (
          <Tooltip key={ind.id}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-block w-1.5 h-1.5 rounded-full flex-shrink-0",
                  ind.status === "advancing" ? "bg-blue-500" : "bg-amber-500"
                )}
                aria-label={`${ind.name}: ${ind.status}`}
              />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-48">
              <p className="text-xs font-medium">{ind.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{ind.status}</p>
            </TooltipContent>
          </Tooltip>
        ))}
        {dormant.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0"
                aria-label={`${dormant.length} dormant plotline(s)`}
              />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-56">
              <p className="text-xs font-medium mb-1">Dormant threads</p>
              {dormant.map((ind) => (
                <p key={ind.id} className="text-xs text-muted-foreground">
                  {ind.name}{ind.lastSeenTitle ? ` (last: ${ind.lastSeenTitle})` : ""}
                </p>
              ))}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    </TooltipProvider>
  );
}

function NodeContent({
  node,
  depth,
  projectType,
  isSelected,
  isOverlay,
  isDragging,
  onToggleExpand,
  onSelectNode,
  onAddNode,
  onRenameNode,
  onDeleteNode,
  dragHandleProps,
}: {
  node: OutlineNode;
  depth: number;
  projectType: ProjectType;
  isSelected: boolean;
  isOverlay?: boolean;
  isDragging?: boolean;
  onToggleExpand?: () => void;
  onSelectNode: (nodeId: string) => void;
  onAddNode: (parentId: string | null, type: "CHAPTER" | "SCENE") => void;
  onRenameNode: (nodeId: string, currentTitle: string) => void;
  onDeleteNode: (nodeId: string, title: string) => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  const isScene = node.type === "SCENE";

  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={isScene ? undefined : node.children.length > 0 ? true : false}
      aria-label={node.title}
      tabIndex={isSelected ? 0 : -1}
      className={cn(
        "group flex items-center gap-1 py-1.5 px-2 rounded-lg cursor-pointer text-sm transition-all duration-150",
        "hover:bg-surface-overlay/60",
        isSelected && "bg-accent/10 text-accent font-medium",
        !isSelected && "text-text-secondary",
        isOverlay && "bg-surface-raised shadow-lg border border-border rounded-lg",
        isDragging && "opacity-30",
      )}
      style={{ paddingLeft: isOverlay ? "8px" : `${depth * 16 + 8}px` }}
      onClick={() => {
        if (isScene) {
          onSelectNode(node.id);
        } else if (onToggleExpand) {
          onToggleExpand();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (isScene) {
            onSelectNode(node.id);
          } else if (onToggleExpand) {
            onToggleExpand();
          }
        }
      }}
    >
      {/* Drag handle */}
      <span
        className={cn(
          "flex-shrink-0 cursor-grab active:cursor-grabbing text-text-muted/50 hover:text-text-muted",
          isOverlay ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        {...dragHandleProps}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>

      {!isScene && (
        <span className="text-text-muted w-4 flex-shrink-0" aria-hidden="true">
          {node.children.length > 0 ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      )}
      {isScene ? (
        <FileText className={cn("h-4 w-4 flex-shrink-0", isSelected ? "text-accent" : "text-text-muted")} aria-hidden="true" />
      ) : node.type === "CHAPTER" ? (
        <FolderOpen className="h-4 w-4 text-text-muted flex-shrink-0" aria-hidden="true" />
      ) : (
        <BookOpen className="h-4 w-4 text-text-muted flex-shrink-0" aria-hidden="true" />
      )}
      <span className="truncate flex-1">{node.title}</span>
      {isScene && <StatusDot status={node.status as SceneStatus} />}
      {isScene && node.plotIndicators && node.plotIndicators.length > 0 && (
        <PlotThreadDots indicators={node.plotIndicators} />
      )}
      {isScene && node.wordCount !== undefined && node.wordCount > 0 && (
        <span className="text-xs text-text-muted tabular-nums">{node.wordCount}</span>
      )}
      {!isOverlay && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0 transition-opacity"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Actions for ${node.title}`}
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {!isScene && (
              <>
                <DropdownMenuItem onClick={() => onAddNode(node.id, "SCENE")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add {PROJECT_TYPE_LABELS[projectType].SCENE}
                </DropdownMenuItem>
                {node.type === "PART" && (
                  <DropdownMenuItem onClick={() => onAddNode(node.id, "CHAPTER")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add {PROJECT_TYPE_LABELS[projectType].CHAPTER}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => onRenameNode(node.id, node.title)}>
              <Pencil className="h-4 w-4 mr-2" />
              Rename
            </DropdownMenuItem>
            {isScene && (
              <DropdownMenuItem onClick={() => window.location.href = `/project/${node.projectId}/scene/${node.id}/focus`}>
                <Maximize className="h-4 w-4 mr-2" />
                Focus Mode
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-danger"
              onClick={() => onDeleteNode(node.id, node.title)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function SortableTreeNode({
  node,
  depth,
  projectType,
  selectedNodeId,
  expandedIds,
  onToggleExpand,
  onSelectNode,
  onAddNode,
  onRenameNode,
  onDeleteNode,
  overNodeId,
  dropPosition,
}: {
  node: OutlineNode;
  depth: number;
  projectType: ProjectType;
  selectedNodeId: string | null;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelectNode: (nodeId: string) => void;
  onAddNode: (parentId: string | null, type: "CHAPTER" | "SCENE") => void;
  onRenameNode: (nodeId: string, currentTitle: string) => void;
  onDeleteNode: (nodeId: string, title: string) => void;
  overNodeId: string | null;
  dropPosition: "before" | "after" | "inside" | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const expanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedNodeId === node.id;
  const isOver = overNodeId === node.id;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {/* Drop indicator: before */}
      {isOver && dropPosition === "before" && (
        <div
          className="h-0.5 bg-accent rounded-full mx-2"
          style={{ marginLeft: `${depth * 16 + 8}px` }}
        />
      )}

      {/* Drop indicator: inside (container highlight) */}
      <div className={cn(
        isOver && dropPosition === "inside" && "ring-1 ring-accent/50 rounded-lg bg-accent/5",
      )}>
        <NodeContent
          node={node}
          depth={depth}
          projectType={projectType}
          isSelected={isSelected}
          isDragging={isDragging}
          onToggleExpand={() => onToggleExpand(node.id)}
          onSelectNode={onSelectNode}
          onAddNode={onAddNode}
          onRenameNode={onRenameNode}
          onDeleteNode={onDeleteNode}
          dragHandleProps={listeners}
        />
      </div>

      {/* Drop indicator: after */}
      {isOver && dropPosition === "after" && (
        <div
          className="h-0.5 bg-accent rounded-full mx-2"
          style={{ marginLeft: `${depth * 16 + 8}px` }}
        />
      )}

      {/* Children */}
      {expanded && hasChildren && !isDragging && (
        <div>
          {node.children.map((child) => (
            <SortableTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              projectType={projectType}
              selectedNodeId={selectedNodeId}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onSelectNode={onSelectNode}
              onAddNode={onAddNode}
              onRenameNode={onRenameNode}
              onDeleteNode={onDeleteNode}
              overNodeId={overNodeId}
              dropPosition={dropPosition}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Flatten tree into a list of IDs for SortableContext */
function flattenIds(nodes: OutlineNode[], expandedIds: Set<string>): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    result.push(node.id);
    if (expandedIds.has(node.id) && node.children.length > 0) {
      result.push(...flattenIds(node.children, expandedIds));
    }
  }
  return result;
}

/** Build a lookup map from node ID to its parent and sibling index */
function buildNodeMap(nodes: OutlineNode[], parentId: string | null = null): Map<string, { node: OutlineNode; parentId: string | null; index: number; depth: number }> {
  const map = new Map<string, { node: OutlineNode; parentId: string | null; index: number; depth: number }>();

  function walk(children: OutlineNode[], pid: string | null, depth: number) {
    children.forEach((child, index) => {
      map.set(child.id, { node: child, parentId: pid, index, depth });
      if (child.children.length > 0) {
        walk(child.children, child.id, depth + 1);
      }
    });
  }

  walk(nodes, parentId, 0);
  return map;
}

export function OutlineTree({
  nodes,
  projectType,
  selectedNodeId,
  onSelectNode,
  onAddNode,
  onRenameNode,
  onDeleteNode,
  onMoveNode,
}: OutlineTreeProps) {
  const labels = PROJECT_TYPE_LABELS[projectType];
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Expand all non-scene nodes by default
    const ids = new Set<string>();
    function walk(n: OutlineNode[]) {
      for (const node of n) {
        if (node.type !== "SCENE") ids.add(node.id);
        walk(node.children);
      }
    }
    walk(nodes);
    return ids;
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overNodeId, setOverNodeId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | "inside" | null>(null);

  const nodeMap = useMemo(() => buildNodeMap(nodes), [nodes]);
  const flatIds = useMemo(() => flattenIds(nodes, expandedIds), [nodes, expandedIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const activeNode = activeId ? nodeMap.get(activeId)?.node : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setOverNodeId(null);
      setDropPosition(null);
      return;
    }

    const overId = over.id as string;
    const overInfo = nodeMap.get(overId);
    if (!overInfo) return;

    const overRect = over.rect;
    const pointerY = (event.activatorEvent as PointerEvent).clientY + (event.delta?.y ?? 0);
    const relativeY = pointerY - overRect.top;
    const height = overRect.height;

    const isContainer = overInfo.node.type !== "SCENE";

    if (isContainer) {
      // For containers: top 25% = before, middle 50% = inside, bottom 25% = after
      if (relativeY < height * 0.25) {
        setDropPosition("before");
      } else if (relativeY > height * 0.75) {
        setDropPosition("after");
      } else {
        setDropPosition("inside");
      }
    } else {
      // For scenes: top 50% = before, bottom 50% = after
      if (relativeY < height * 0.5) {
        setDropPosition("before");
      } else {
        setDropPosition("after");
      }
    }

    setOverNodeId(overId);
  }, [nodeMap]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverNodeId(null);
    setDropPosition(null);

    if (!over || !onMoveNode || active.id === over.id || !dropPosition) return;

    const draggedId = active.id as string;
    const targetId = over.id as string;
    const targetInfo = nodeMap.get(targetId);
    if (!targetInfo) return;

    let newParentId: string | null;
    let newIndex: number;

    if (dropPosition === "inside") {
      // Drop inside a container → append as first child
      newParentId = targetId;
      newIndex = 0;
    } else if (dropPosition === "before") {
      // Drop before the target → same parent, at target's index
      newParentId = targetInfo.parentId;
      newIndex = targetInfo.index;
    } else {
      // Drop after the target → same parent, after target's index
      newParentId = targetInfo.parentId;
      newIndex = targetInfo.index + 1;
    }

    // Adjust index if moving within the same parent and from before the target
    const draggedInfo = nodeMap.get(draggedId);
    if (draggedInfo && draggedInfo.parentId === newParentId && draggedInfo.index < newIndex) {
      newIndex--;
    }

    onMoveNode(draggedId, newParentId, newIndex);
  }, [onMoveNode, dropPosition, nodeMap]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOverNodeId(null);
    setDropPosition(null);
  }, []);

  return (
    <div className="py-2" role="tree" aria-label="Document outline">
      {nodes.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-text-muted">
          <p>No {labels.CHAPTER.toLowerCase()}s yet.</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => onAddNode(null, "CHAPTER")}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add {labels.CHAPTER}
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
            {nodes.map((node) => (
              <SortableTreeNode
                key={node.id}
                node={node}
                depth={0}
                projectType={projectType}
                selectedNodeId={selectedNodeId}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                onSelectNode={onSelectNode}
                onAddNode={onAddNode}
                onRenameNode={onRenameNode}
                onDeleteNode={onDeleteNode}
                overNodeId={overNodeId}
                dropPosition={dropPosition}
              />
            ))}
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeNode ? (
              <NodeContent
                node={activeNode}
                depth={0}
                projectType={projectType}
                isSelected={false}
                isOverlay
                onSelectNode={() => {}}
                onAddNode={() => {}}
                onRenameNode={() => {}}
                onDeleteNode={() => {}}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
