// Shared types used across the app

export interface Project {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  genre: string;
  wordCount?: number;
  createdAt: string;
  updatedAt: string;
}

export type StructureNodeType = "PART" | "CHAPTER" | "SCENE";
export type SceneStatus = "OUTLINE" | "DRAFT" | "REVISED" | "FINAL";

export interface StructureNode {
  id: string;
  projectId: string;
  parentId: string | null;
  type: StructureNodeType;
  title: string;
  synopsis: string;
  status: SceneStatus;
  orderIndex: number;
  wordCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OutlineNode extends StructureNode {
  children: OutlineNode[];
}

export type StoryObjectType = "CHARACTER" | "LOCATION" | "PLOTLINE" | "WORLD_ELEMENT" | "NOTE";

export interface StoryObject {
  id: string;
  projectId: string;
  type: StoryObjectType;
  name: string;
  description: string;
  notes: string;
  role: string | null;
  tags: string;
  createdAt: string;
  updatedAt: string;
}

export interface Relationship {
  id: string;
  type: string;
  label: string;
  fromNodeId: string | null;
  fromObjectId: string | null;
  toNodeId: string | null;
  toObjectId: string | null;
  createdAt: string;
  fromNode?: StructureNode;
  fromObject?: StoryObject;
  toNode?: StructureNode;
  toObject?: StoryObject;
}

export interface ContentVersion {
  id: string;
  nodeId: string;
  content: string;
  wordCount: number;
  createdAt: string;
}

export interface Annotation {
  id: string;
  nodeId: string;
  content: string;
  range: string;
  selectedText?: string | null;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export const SCENE_STATUS_COLORS: Record<SceneStatus, string> = {
  OUTLINE: "bg-surface-overlay text-text-muted",
  DRAFT: "bg-warning/15 text-warning",
  REVISED: "bg-accent/15 text-accent",
  FINAL: "bg-success/15 text-success",
};

export const SCENE_STATUS_DOT_COLORS: Record<SceneStatus, string> = {
  OUTLINE: "status-outline",
  DRAFT: "status-draft",
  REVISED: "status-revised",
  FINAL: "status-final",
};

export const STORY_OBJECT_ICONS: Record<StoryObjectType, string> = {
  CHARACTER: "Users",
  LOCATION: "MapPin",
  PLOTLINE: "GitBranch",
  WORLD_ELEMENT: "Globe",
  NOTE: "StickyNote",
};
