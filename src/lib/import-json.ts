import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertActiveProjectLimit } from "@/lib/project-limit";
import { randomUUID } from "crypto";
import { sanitizeHtml, sanitizeInput } from "@/lib/sanitize-server";
import { MAX_SCENE_VERSIONS } from "@/lib/controllers/structure";
import { NodeType, SceneStatus } from "@/schemas/nodes";
import { ProjectType } from "@/schemas/projects";
import { StoryObjectType } from "@/schemas/story-objects";

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
    createdAt?: string;
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

export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportValidationError";
  }
}

const MAX_IMPORT_ITEMS = {
  structureNodes: 5_000,
  contentVersions: 20_000,
  storyObjects: 5_000,
  annotations: 20_000,
  relationships: 20_000,
} as const;

// Bounded by the Postgres `int4` column, not NodeOrderIndex: node creation
// via `insertAfterIndex` is unbounded, so real exports can exceed that range.
const ImportedOrderIndex = z.number().int().min(-2_147_483_648).max(2_147_483_647);

/** Rejects payloads whose shape would make the import unbounded or store values the app can't render. */
function assertImportable(data: ExportData) {
  for (const [key, max] of Object.entries(MAX_IMPORT_ITEMS)) {
    const items: unknown = data[key as keyof typeof MAX_IMPORT_ITEMS];
    if (!Array.isArray(items)) throw new ImportValidationError(`${key} must be an array`);
    if (items.length > max) throw new ImportValidationError(`${key} exceeds the maximum of ${max}`);
    if (!items.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))) {
      throw new ImportValidationError(`${key} entries must be objects`);
    }
  }
  if (data.project.projectType && !ProjectType.safeParse(data.project.projectType).success) {
    throw new ImportValidationError(`Invalid projectType: ${data.project.projectType}`);
  }
  for (const node of data.structureNodes) {
    if (!NodeType.safeParse(node.type).success) {
      throw new ImportValidationError(`Invalid structure node type: ${node.type}`);
    }
    if (node.status && !SceneStatus.safeParse(node.status).success) {
      throw new ImportValidationError(`Invalid structure node status: ${node.status}`);
    }
    if (!ImportedOrderIndex.safeParse(node.orderIndex).success) {
      throw new ImportValidationError(`Invalid structure node orderIndex: ${node.orderIndex}`);
    }
  }
  for (const obj of data.storyObjects) {
    if (!StoryObjectType.safeParse(obj.type).success) {
      throw new ImportValidationError(`Invalid story object type: ${obj.type}`);
    }
  }
}

/**
 * Import a project from the standard export JSON format.
 * Generates new IDs for all entities while preserving internal references.
 * Enforces the active-project limit, except for the onboarding sample
 * (`isSample`), which a partial unique index already caps at one per user.
 */
export async function importProjectJson(
  data: ExportData,
  options?: { userId?: string; isSample?: boolean }
): Promise<{ projectId: string }> {
  assertImportable(data);

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
    if (!options?.isSample) await assertActiveProjectLimit(tx, options?.userId);

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

    // 3. Create content versions, keeping only each node's latest
    // MAX_SCENE_VERSIONS. The payload may be hand-edited, so order by
    // createdAt rather than trusting array position; versions without a
    // parseable createdAt sort as oldest.
    const createdAtMs = (cv: ExportData["contentVersions"][number]) =>
      Date.parse(cv.createdAt ?? "") || 0;
    const newestFirst = [...data.contentVersions].sort(
      (a, b) => createdAtMs(b) - createdAtMs(a)
    );
    const versionsPerNode = new Map<string, number>();
    for (const cv of newestFirst) {
      const newNodeId = nodeIdMap.get(cv.nodeId);
      if (!newNodeId) continue;
      const kept = versionsPerNode.get(newNodeId) ?? 0;
      if (kept >= MAX_SCENE_VERSIONS) continue;
      versionsPerNode.set(newNodeId, kept + 1);
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
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return { projectId };
}
