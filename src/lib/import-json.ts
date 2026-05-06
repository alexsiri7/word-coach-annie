import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";
import { sanitizeHtml, sanitizeInput } from "@/lib/sanitize-server";

interface ExportData {
  exportVersion: number;
  project: {
    title: string;
    author: string;
    synopsis: string;
    genre: string;
    projectType: string;
  };
  structureNodes: Array<{
    id: string;
    parentId: string | null;
    type: string;
    title: string;
    synopsis: string;
    status: string;
    orderIndex: number;
  }>;
  contentVersions: Array<{
    id: string;
    nodeId: string;
    content: string;
    wordCount: number;
  }>;
  storyObjects: Array<{
    id: string;
    type: string;
    name: string;
    description: string;
    notes: string;
    role: string | null;
    tags: string;
  }>;
  annotations: Array<{
    id: string;
    nodeId: string;
    content: string;
    resolved: boolean;
    range: string;
    selectedText: string | null;
  }>;
  relationships: Array<{
    id: string;
    type: string;
    label: string;
    fromNodeId: string | null;
    fromObjectId: string | null;
    toNodeId: string | null;
    toObjectId: string | null;
  }>;
  chatHistory?: Array<{
    id: string;
    role: string;
    content: string;
  }>;
}

/**
 * Import a project from the standard export JSON format.
 * Generates new IDs for all entities while preserving internal references.
 */
export async function importProjectJson(
  data: ExportData,
  options?: { userId?: string; isSample?: boolean }
): Promise<{ projectId: string }> {
  // Build ID mapping tables: old ID -> new ID
  const nodeIdMap = new Map<string, string>();
  const objectIdMap = new Map<string, string>();

  for (const node of data.structureNodes) {
    nodeIdMap.set(node.id, randomUUID());
  }
  for (const obj of data.storyObjects) {
    objectIdMap.set(obj.id, randomUUID());
  }

  const projectId = randomUUID();

  await prisma.$transaction(async (tx) => {
    // 1. Create project
    await tx.project.create({
      data: {
        id: projectId,
        title: sanitizeInput(data.project.title ?? ""),
        author: sanitizeInput(data.project.author ?? ""),
        synopsis: sanitizeInput(data.project.synopsis ?? ""),
        genre: sanitizeInput(data.project.genre ?? ""),
        projectType: data.project.projectType || "FICTION",
        isSample: options?.isSample ?? false,
        ...(options?.userId && { userId: options.userId }),
      },
    });

    // 2. Create structure nodes (order matters for parent references)
    // Sort so parents come before children
    const sortedNodes = [...data.structureNodes].sort((a, b) => {
      if (a.parentId === null && b.parentId !== null) return -1;
      if (a.parentId !== null && b.parentId === null) return 1;
      return 0;
    });

    for (const node of sortedNodes) {
      await tx.structureNode.create({
        data: {
          id: nodeIdMap.get(node.id)!,
          projectId,
          parentId: node.parentId ? nodeIdMap.get(node.parentId) ?? null : null,
          type: node.type,
          title: sanitizeInput(node.title ?? ""),
          synopsis: sanitizeInput(node.synopsis ?? ""),
          status: node.status || "OUTLINE",
          orderIndex: node.orderIndex,
        },
      });
    }

    // 3. Create content versions
    for (const cv of data.contentVersions) {
      const newNodeId = nodeIdMap.get(cv.nodeId);
      if (!newNodeId) continue;
      await tx.contentVersion.create({
        data: {
          nodeId: newNodeId,
          content: sanitizeHtml(cv.content ?? ""),
          wordCount: cv.wordCount,
        },
      });
    }

    // 4. Create story objects
    for (const obj of data.storyObjects) {
      await tx.storyObject.create({
        data: {
          id: objectIdMap.get(obj.id)!,
          projectId,
          type: obj.type,
          name: sanitizeInput(obj.name ?? ""),
          description: sanitizeInput(obj.description ?? ""),
          notes: sanitizeInput(obj.notes ?? ""),
          role: obj.role,
          tags: sanitizeInput(obj.tags ?? ""),
        },
      });
    }

    // 5. Create annotations
    for (const ann of data.annotations) {
      const newNodeId = nodeIdMap.get(ann.nodeId);
      if (!newNodeId) continue;
      await tx.annotation.create({
        data: {
          nodeId: newNodeId,
          content: sanitizeInput(ann.content ?? ""),
          resolved: ann.resolved ?? false,
          range: ann.range || "",
          selectedText: ann.selectedText ? sanitizeInput(ann.selectedText) : null,
        },
      });
    }

    // 6. Create relationships
    for (const rel of data.relationships) {
      await tx.relationship.create({
        data: {
          type: rel.type,
          label: sanitizeInput(rel.label ?? ""),
          fromNodeId: rel.fromNodeId ? nodeIdMap.get(rel.fromNodeId) ?? null : null,
          fromObjectId: rel.fromObjectId ? objectIdMap.get(rel.fromObjectId) ?? null : null,
          toNodeId: rel.toNodeId ? nodeIdMap.get(rel.toNodeId) ?? null : null,
          toObjectId: rel.toObjectId ? objectIdMap.get(rel.toObjectId) ?? null : null,
        },
      });
    }
  });

  return { projectId };
}
