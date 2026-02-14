"use client";

import { useState } from "react";
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
import type { OutlineNode, SceneStatus } from "@/lib/types";

interface OutlineTreeProps {
  nodes: OutlineNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onAddNode: (parentId: string | null, type: "CHAPTER" | "SCENE") => void;
  onRenameNode: (nodeId: string, currentTitle: string) => void;
  onDeleteNode: (nodeId: string, title: string) => void;
}

function StatusDot({ status }: { status: SceneStatus }) {
  const colors: Record<SceneStatus, string> = {
    OUTLINE: "bg-text-muted/50",
    DRAFT: "bg-warning",
    REVISED: "bg-accent",
    FINAL: "bg-success",
  };
  return <span className={cn("inline-block w-2 h-2 rounded-full flex-shrink-0", colors[status])} />;
}

function TreeNode({
  node,
  depth,
  selectedNodeId,
  onSelectNode,
  onAddNode,
  onRenameNode,
  onDeleteNode,
}: {
  node: OutlineNode;
  depth: number;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onAddNode: (parentId: string | null, type: "CHAPTER" | "SCENE") => void;
  onRenameNode: (nodeId: string, currentTitle: string) => void;
  onDeleteNode: (nodeId: string, title: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isScene = node.type === "SCENE";
  const isSelected = selectedNodeId === node.id;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer text-sm transition-all duration-150",
          "hover:bg-surface-overlay/60",
          isSelected && "bg-accent/10 text-accent font-medium",
          !isSelected && "text-text-secondary"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (isScene) {
            onSelectNode(node.id);
          } else {
            setExpanded(!expanded);
          }
        }}
      >
        {!isScene && (
          <span className="text-text-muted w-4 flex-shrink-0">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        )}
        {isScene ? (
          <FileText className={cn("h-4 w-4 flex-shrink-0", isSelected ? "text-accent" : "text-text-muted")} />
        ) : node.type === "CHAPTER" ? (
          <FolderOpen className="h-4 w-4 text-text-muted flex-shrink-0" />
        ) : (
          <BookOpen className="h-4 w-4 text-text-muted flex-shrink-0" />
        )}
        <span className="truncate flex-1">{node.title}</span>
        {isScene && <StatusDot status={node.status as SceneStatus} />}
        {isScene && node.wordCount !== undefined && node.wordCount > 0 && (
          <span className="text-xs text-text-muted tabular-nums">{node.wordCount}</span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {!isScene && (
              <>
                <DropdownMenuItem onClick={() => onAddNode(node.id, "SCENE")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Scene
                </DropdownMenuItem>
                {node.type === "PART" && (
                  <DropdownMenuItem onClick={() => onAddNode(node.id, "CHAPTER")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Chapter
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => onRenameNode(node.id, node.title)}>
              <Pencil className="h-4 w-4 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-danger"
              onClick={() => onDeleteNode(node.id, node.title)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              onAddNode={onAddNode}
              onRenameNode={onRenameNode}
              onDeleteNode={onDeleteNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function OutlineTree({
  nodes,
  selectedNodeId,
  onSelectNode,
  onAddNode,
  onRenameNode,
  onDeleteNode,
}: OutlineTreeProps) {
  return (
    <div className="py-2">
      {nodes.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-text-muted">
          <p>No chapters yet.</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => onAddNode(null, "CHAPTER")}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Chapter
          </Button>
        </div>
      ) : (
        <>
          {nodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              onAddNode={onAddNode}
              onRenameNode={onRenameNode}
              onDeleteNode={onDeleteNode}
            />
          ))}
        </>
      )}
    </div>
  );
}
