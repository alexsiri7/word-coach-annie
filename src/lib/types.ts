// Shared types used across the app
export type ProjectType = "FICTION" | "ARTICLE_COLLECTION" | "GENERAL";

export interface Project {
  id: string;
  universeId?: string | null;
  title: string;
  author: string;
  synopsis: string;
  genre: string;
  projectType: ProjectType;
  wordCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SceneBlock {
  type: "CONTENT" | "BEAT";
  content: string;
}

export interface Universe {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  projects?: { id: string; title: string }[];
  worldObjects?: WorldObject[];
}

export interface WorldObject {
  id: string;
  universeId: string;
  type: "CHARACTER" | "LOCATION" | "WORLD_ELEMENT";
  name: string;
  description: string;
  notes: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
  timeline?: WorldObjectTimelineEntry[];
  relationships?: Relationship[];
  relatedBy?: Relationship[];
}

export interface WorldObjectTimelineEntry {
  id: string;
  worldObjectId: string;
  label: string;
  orderIndex: number;
  description: string;
  attributes: string;
  projectId?: string | null;
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

export interface PlotlineIndicator {
  id: string;
  name: string;
  status: "advancing" | "mentioned" | "dormant";
  lastSeenTitle?: string;
}

export interface OutlineNode extends StructureNode {
  children: OutlineNode[];
  plotIndicators?: PlotlineIndicator[];
  hasNewFeedback?: boolean; // true when scene has unresolved annotations imported from Google Docs
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
  source?: "project" | "universe";
  createdAt: string;
  updatedAt: string;
}

export interface Relationship {
  id: string;
  type: string;
  label: string;
  fromNodeId: string | null;
  fromObjectId: string | null;
  fromWorldObjectId: string | null;
  toNodeId: string | null;
  toObjectId: string | null;
  toWorldObjectId: string | null;
  createdAt: string;
  fromNode?: StructureNode;
  fromObject?: StoryObject;
  fromWorldObject?: WorldObject;
  toNode?: StructureNode;
  toObject?: StoryObject;
  toWorldObject?: WorldObject;
}

export interface ContentVersion {
  id: string;
  nodeId: string;
  content: string;
  wordCount: number;
  createdAt: string;
}

/** Range encoding for annotations created inside the ProseMirror editor. */
export interface ProseRange {
  from: number;
  to: number;
}

/** Range encoding for annotations created from plain HTML (Read View). */
export interface TextQuoteRange {
  type: "textQuote";
  selectedText: string;
  /** Up to 32 characters of text immediately before the selection. */
  prefix: string;
  /** Up to 32 characters of text immediately after the selection. */
  suffix: string;
}

/** Union of all range shapes serialized into Annotation.range (JSON string). */
export type AnnotationRange = ProseRange | TextQuoteRange;

export interface Annotation {
  id: string;
  nodeId: string;
  content: string;
  range: string;
  selectedText?: string | null;
  externalId?: string | null; // set for annotations imported from Google Docs
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

import type {
  WritingTaskImportanceValue as WritingTaskImportance,
  WritingTaskSizeValue as WritingTaskSize,
  WritingTaskEnergyValue as WritingTaskEnergy,
} from "@/schemas/writing-tasks";

export type { WritingTaskImportance, WritingTaskSize, WritingTaskEnergy };

export interface WritingTask {
  id: string;
  projectId: string;
  sceneId?: string | null;
  name: string;
  whatIsNeeded: string;
  importance: WritingTaskImportance;
  size: WritingTaskSize;
  energy: WritingTaskEnergy;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  scene?: { id: string; title: string } | null;
}
