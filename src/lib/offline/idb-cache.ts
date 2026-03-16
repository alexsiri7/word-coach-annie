/**
 * IDB cache layer: populates IndexedDB from API responses and serves
 * cached data when offline. This bridges the gap between the IDB schema
 * (which already exists) and the UI data fetching.
 */

import {
  idbPut,
  idbGetAll,
  idbGet,
  idbGetNodesByProject,
  idbGetStoryObjectsByProject,
  idbGetContentByNode,
  idbGetAnnotationsByNode,
  type AnnieDBSchema,
} from "./idb";

// ─── Cache writers (call after successful API responses) ──────────────

/** Cache a list of projects to IDB. */
export async function cacheProjects(
  projects: AnnieDBSchema["projects"]["value"][]
): Promise<void> {
  await Promise.all(projects.map((p) => idbPut("projects", p)));
}

/** Cache structure nodes for a project. */
export async function cacheStructureNodes(
  nodes: AnnieDBSchema["structureNodes"]["value"][]
): Promise<void> {
  await Promise.all(nodes.map((n) => idbPut("structureNodes", n)));
}

/** Cache story objects for a project. */
export async function cacheStoryObjects(
  objects: AnnieDBSchema["storyObjects"]["value"][]
): Promise<void> {
  await Promise.all(objects.map((o) => idbPut("storyObjects", o)));
}

/** Cache a content version for a node. */
export async function cacheContentVersion(
  version: AnnieDBSchema["contentVersions"]["value"]
): Promise<void> {
  await idbPut("contentVersions", version);
}

/** Cache annotations for a node. */
export async function cacheAnnotations(
  annotations: AnnieDBSchema["annotations"]["value"][]
): Promise<void> {
  await Promise.all(annotations.map((a) => idbPut("annotations", a)));
}

// ─── Cache readers (call when offline) ────────────────────────────────

/** Get cached projects. */
export async function getCachedProjects(): Promise<
  AnnieDBSchema["projects"]["value"][]
> {
  return idbGetAll("projects");
}

/** Get a single cached project. */
export async function getCachedProject(
  id: string
): Promise<AnnieDBSchema["projects"]["value"] | undefined> {
  return idbGet("projects", id);
}

/** Get cached structure nodes for a project. */
export async function getCachedNodesByProject(
  projectId: string
): Promise<AnnieDBSchema["structureNodes"]["value"][]> {
  return idbGetNodesByProject(projectId);
}

/** Get cached story objects for a project. */
export async function getCachedStoryObjectsByProject(
  projectId: string
): Promise<AnnieDBSchema["storyObjects"]["value"][]> {
  return idbGetStoryObjectsByProject(projectId);
}

/** Get cached content for a node. */
export async function getCachedContentByNode(
  nodeId: string
): Promise<AnnieDBSchema["contentVersions"]["value"][]> {
  return idbGetContentByNode(nodeId);
}

/** Get cached annotations for a node. */
export async function getCachedAnnotationsByNode(
  nodeId: string
): Promise<AnnieDBSchema["annotations"]["value"][]> {
  return idbGetAnnotationsByNode(nodeId);
}

// ─── Flatten outline tree to flat node list ───────────────────────────

interface OutlineNode {
  id: string;
  projectId?: string;
  parentId: string | null;
  type: string;
  title: string;
  synopsis?: string;
  status?: string;
  orderIndex: number;
  wordCount?: number;
  createdAt: string;
  updatedAt: string;
  children: OutlineNode[];
}

/** Flatten a nested outline tree into a flat list of nodes for IDB storage. */
export function flattenOutlineTree(
  nodes: OutlineNode[],
  projectId: string
): AnnieDBSchema["structureNodes"]["value"][] {
  const flat: AnnieDBSchema["structureNodes"]["value"][] = [];
  function walk(list: OutlineNode[]) {
    for (const n of list) {
      flat.push({
        id: n.id,
        projectId,
        parentId: n.parentId,
        type: n.type,
        title: n.title,
        synopsis: n.synopsis || "",
        status: n.status || "DRAFT",
        orderIndex: n.orderIndex,
        wordCount: n.wordCount,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      });
      if (n.children?.length) walk(n.children);
    }
  }
  walk(nodes);
  return flat;
}

// ─── Rebuild outline tree from flat nodes ─────────────────────────────

/** Rebuild a nested outline tree from flat IDB nodes. */
export function buildOutlineTree(
  flatNodes: AnnieDBSchema["structureNodes"]["value"][]
): OutlineNode[] {
  const nodeMap = new Map<string, OutlineNode>();
  const roots: OutlineNode[] = [];

  // Create node objects with empty children
  for (const n of flatNodes) {
    nodeMap.set(n.id, { ...n, children: [] });
  }

  // Build tree
  for (const n of flatNodes) {
    const node = nodeMap.get(n.id)!;
    if (n.parentId && nodeMap.has(n.parentId)) {
      nodeMap.get(n.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by orderIndex
  function sortChildren(nodes: OutlineNode[]) {
    nodes.sort((a, b) => a.orderIndex - b.orderIndex);
    for (const n of nodes) {
      if (n.children.length) sortChildren(n.children);
    }
  }
  sortChildren(roots);

  return roots;
}
