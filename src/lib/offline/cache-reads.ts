import {
  idbPut,
  idbGetAll,
  idbGetNodesByProject,
  idbGetContentByNode,
  idbGetStoryObjectsByProject,
  type AnnieDBSchema,
} from "./idb";
import type { OutlineNode, SceneStatus, StructureNodeType } from "@/lib/types";

// ─── Cache Writers ─────────────────────────────────────────────────────────

/** Persist projects into IndexedDB after a successful fetch. */
export async function cacheProjects(
  projects: AnnieDBSchema["projects"]["value"][]
): Promise<void> {
  for (const p of projects) {
    await idbPut("projects", p);
  }
}

/** Persist a flat list of structure nodes (from an OutlineNode tree) into IndexedDB. */
export async function cacheStructureNodes(tree: OutlineNode[]): Promise<void> {
  const flat = flattenTree(tree);
  for (const n of flat) {
    await idbPut("structureNodes", n);
  }
}

/** Persist a single content version into IndexedDB. */
export async function cacheContentVersion(
  version: AnnieDBSchema["contentVersions"]["value"]
): Promise<void> {
  await idbPut("contentVersions", version);
}

/** Persist story objects into IndexedDB after a successful fetch. */
export async function cacheStoryObjects(
  objects: AnnieDBSchema["storyObjects"]["value"][]
): Promise<void> {
  for (const o of objects) {
    await idbPut("storyObjects", o);
  }
}

// ─── Cache Readers ─────────────────────────────────────────────────────────

/** Return all cached projects from IndexedDB. */
export async function getCachedProjects(): Promise<
  AnnieDBSchema["projects"]["value"][]
> {
  return idbGetAll("projects");
}

/** Rebuild an OutlineNode tree from cached flat structure nodes. */
export async function getCachedOutline(
  projectId: string
): Promise<OutlineNode[]> {
  const nodes = await idbGetNodesByProject(projectId);
  return buildTree(nodes);
}

/** Return the latest cached content version for a node (by createdAt). */
export async function getCachedContent(
  nodeId: string
): Promise<AnnieDBSchema["contentVersions"]["value"] | undefined> {
  const versions = await idbGetContentByNode(nodeId);
  if (versions.length === 0) return undefined;
  return versions.reduce((latest, v) =>
    new Date(v.createdAt) > new Date(latest.createdAt) ? v : latest
  );
}

/** Return all cached story objects for a project. */
export async function getCachedStoryObjects(
  projectId: string
): Promise<AnnieDBSchema["storyObjects"]["value"][]> {
  return idbGetStoryObjectsByProject(projectId);
}

// ─── Internal Helpers ──────────────────────────────────────────────────────

/** Flatten an OutlineNode tree into StructureNode-compatible records (no children/plotIndicators/hasNewFeedback). */
function flattenTree(
  nodes: OutlineNode[]
): AnnieDBSchema["structureNodes"]["value"][] {
  return nodes.flatMap((n) => {
    const { children, plotIndicators: _plotIndicators, hasNewFeedback: _hasNewFeedback, ...node } = n;
    return [node, ...flattenTree(children)];
  });
}

/** Rebuild an OutlineNode tree from flat structure-node records. */
function buildTree(
  nodes: AnnieDBSchema["structureNodes"]["value"][]
): OutlineNode[] {
  const map = new Map<string, OutlineNode>();
  const roots: OutlineNode[] = [];

  // First pass: create OutlineNode shells
  for (const n of nodes) {
    map.set(n.id, {
      ...n,
      type: n.type as StructureNodeType,
      status: n.status as SceneStatus,
      children: [],
    });
  }

  // Second pass: attach children
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }

  // Sort children by orderIndex
  for (const n of map.values()) {
    n.children.sort((a, b) => a.orderIndex - b.orderIndex);
  }
  roots.sort((a, b) => a.orderIndex - b.orderIndex);

  return roots;
}
