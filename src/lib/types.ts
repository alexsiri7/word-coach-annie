// Shared types used across the app

export interface Project {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  genre: string;
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

export const SCENE_STATUS_COLORS: Record<SceneStatus, string> = {
  OUTLINE: "bg-gray-200 text-gray-700",
  DRAFT: "bg-yellow-100 text-yellow-800",
  REVISED: "bg-blue-100 text-blue-800",
  FINAL: "bg-green-100 text-green-800",
};

export const STORY_OBJECT_ICONS: Record<StoryObjectType, string> = {
  CHARACTER: "Users",
  LOCATION: "MapPin",
  PLOTLINE: "GitBranch",
  WORLD_ELEMENT: "Globe",
  NOTE: "StickyNote",
};
