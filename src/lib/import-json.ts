import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

/** Shape of the JSON export (exportVersion: 1) */
interface ExportData {
  exportVersion: number;
  exportedAt: string;
  project: {
    id: string;
    title: string;
    author: string;
    synopsis: string;
    genre: string;
    projectType: string;
    createdAt: string;
    updatedAt: string;
  };
  structureNodes: {
    id: string;
    parentId: string | null;
    type: string;
    title: string;
    synopsis: string;
    status: string;
    orderIndex: number;
    createdAt: string;
    updatedAt: string;
  }[];
  contentVersions: {
    id: string;
    nodeId: string;
    content: string;
    wordCount: number;
    createdAt: string;
  }[];
  storyObjects: {
    id: string;
    type: string;
    name: string;
    description: string;
    notes: string;
    role: string | null;
    tags: string;
    createdAt: string;
    updatedAt: string;
  }[];
  annotations: {
    id: string;
    nodeId: string;
    content: string;
    resolved: boolean;
    range: string;
    selectedText: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  relationships: {
    id: string;
    type: string;
    label: string;
    fromNodeId: string | null;
    fromObjectId: string | null;
    toNodeId: string | null;
    toObjectId: string | null;
    createdAt: string;
  }[];
  chatHistory: {
    id: string;
    role: string;
    content: string;
    createdAt: string;
  }[];
}

function generateId(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * Validate that the input looks like a valid export JSON.
 * Returns a typed ExportData or throws with a descriptive message.
 */
function validateExport(data: unknown): ExportData {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid JSON: expected an object");
  }

  const obj = data as Record<string, unknown>;

  if (obj.exportVersion !== 1) {
    throw new Error(
      `Unsupported export version: ${obj.exportVersion}. Expected 1.`
    );
  }

  if (!obj.project || typeof obj.project !== "object") {
    throw new Error("Invalid JSON: missing project field");
  }

  const project = obj.project as Record<string, unknown>;
  if (!project.title || typeof project.title !== "string") {
    throw new Error("Invalid JSON: project must have a title");
  }

  // Arrays can be missing (treated as empty)
  return {
    exportVersion: 1,
    exportedAt: String(obj.exportedAt || ""),
    project: obj.project as ExportData["project"],
    structureNodes: Array.isArray(obj.structureNodes)
      ? obj.structureNodes
      : [],
    contentVersions: Array.isArray(obj.contentVersions)
      ? obj.contentVersions
      : [],
    storyObjects: Array.isArray(obj.storyObjects) ? obj.storyObjects : [],
    annotations: Array.isArray(obj.annotations) ? obj.annotations : [],
    relationships: Array.isArray(obj.relationships) ? obj.relationships : [],
    chatHistory: Array.isArray(obj.chatHistory) ? obj.chatHistory : [],
  };
}

/**
 * Import a project from JSON export data.
 * Creates a new project with fresh IDs and remaps all internal references.
 * Returns the newly created project ID.
 */
export async function importProjectJson(
  data: unknown,
  userId: string | null
): Promise<{ projectId: string; title: string; stats: Record<string, number> }> {
  const exportData = validateExport(data);

  // Build ID remapping tables: old ID -> new ID
  const projectId = generateId();
  const nodeIdMap = new Map<string, string>();
  const objectIdMap = new Map<string, string>();
  const contentVersionIdMap = new Map<string, string>();
  const annotationIdMap = new Map<string, string>();

  // Pre-generate all new IDs
  for (const node of exportData.structureNodes) {
    nodeIdMap.set(node.id, generateId());
  }
  for (const obj of exportData.storyObjects) {
    objectIdMap.set(obj.id, generateId());
  }
  for (const cv of exportData.contentVersions) {
    contentVersionIdMap.set(cv.id, generateId());
  }
  for (const ann of exportData.annotations) {
    annotationIdMap.set(ann.id, generateId());
  }

  // Use a transaction to ensure atomicity
  await prisma.$transaction(async (tx) => {
    // 1. Create the project
    await tx.project.create({
      data: {
        id: projectId,
        title: exportData.project.title,
        author: exportData.project.author || "",
        synopsis: exportData.project.synopsis || "",
        genre: exportData.project.genre || "",
        projectType: exportData.project.projectType || "FICTION",
        ...(userId && { userId }),
      },
    });

    // 2. Create structure nodes (order matters for parent references — parents first)
    // Sort so parents come before children
    const sortedNodes = [...exportData.structureNodes].sort((a, b) => {
      // Nodes without parents first
      if (!a.parentId && b.parentId) return -1;
      if (a.parentId && !b.parentId) return 1;
      return 0;
    });

    for (const node of sortedNodes) {
      const newId = nodeIdMap.get(node.id)!;
      const newParentId = node.parentId
        ? nodeIdMap.get(node.parentId) ?? null
        : null;

      await tx.structureNode.create({
        data: {
          id: newId,
          projectId,
          parentId: newParentId,
          type: node.type,
          title: node.title,
          synopsis: node.synopsis || "",
          status: node.status || "OUTLINE",
          orderIndex: node.orderIndex ?? 0,
        },
      });
    }

    // 3. Create content versions
    for (const cv of exportData.contentVersions) {
      const newNodeId = nodeIdMap.get(cv.nodeId);
      if (!newNodeId) continue; // Skip orphaned content versions

      await tx.contentVersion.create({
        data: {
          id: contentVersionIdMap.get(cv.id)!,
          nodeId: newNodeId,
          content: cv.content || "",
          wordCount: cv.wordCount ?? 0,
        },
      });
    }

    // 4. Create story objects
    for (const obj of exportData.storyObjects) {
      await tx.storyObject.create({
        data: {
          id: objectIdMap.get(obj.id)!,
          projectId,
          type: obj.type,
          name: obj.name,
          description: obj.description || "",
          notes: obj.notes || "",
          role: obj.role || null,
          tags: obj.tags || "",
        },
      });
    }

    // 5. Create annotations
    for (const ann of exportData.annotations) {
      const newNodeId = nodeIdMap.get(ann.nodeId);
      if (!newNodeId) continue; // Skip orphaned annotations

      await tx.annotation.create({
        data: {
          id: annotationIdMap.get(ann.id)!,
          nodeId: newNodeId,
          content: ann.content || "",
          resolved: ann.resolved ?? false,
          range: ann.range || "",
          selectedText: ann.selectedText ?? null,
        },
      });
    }

    // 6. Create relationships (remap node/object references)
    for (const rel of exportData.relationships) {
      const fromNodeId = rel.fromNodeId
        ? nodeIdMap.get(rel.fromNodeId) ?? null
        : null;
      const fromObjectId = rel.fromObjectId
        ? objectIdMap.get(rel.fromObjectId) ?? null
        : null;
      const toNodeId = rel.toNodeId
        ? nodeIdMap.get(rel.toNodeId) ?? null
        : null;
      const toObjectId = rel.toObjectId
        ? objectIdMap.get(rel.toObjectId) ?? null
        : null;

      // Skip relationships where both endpoints are missing (orphaned)
      if (!fromNodeId && !fromObjectId && !toNodeId && !toObjectId) continue;

      await tx.relationship.create({
        data: {
          id: generateId(),
          type: rel.type,
          label: rel.label || "",
          fromNodeId,
          fromObjectId,
          toNodeId,
          toObjectId,
        },
      });
    }

    // 7. Create chat messages
    for (const msg of exportData.chatHistory) {
      await tx.chatMessage.create({
        data: {
          id: generateId(),
          projectId,
          role: msg.role,
          content: msg.content || "",
        },
      });
    }
  });

  return {
    projectId,
    title: exportData.project.title,
    stats: {
      structureNodes: exportData.structureNodes.length,
      contentVersions: exportData.contentVersions.length,
      storyObjects: exportData.storyObjects.length,
      annotations: exportData.annotations.length,
      relationships: exportData.relationships.length,
      chatMessages: exportData.chatHistory.length,
    },
  };
}
