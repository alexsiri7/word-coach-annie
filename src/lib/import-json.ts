import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertActiveProjectLimit } from "@/lib/project-limit";
import { randomUUID } from "crypto";
import { sanitizeHtml, sanitizeInput } from "@/lib/sanitize-server";
import { countSceneWords } from "@/lib/scene-text";
import { MAX_SCENE_VERSIONS } from "@/lib/controllers/structure";
import { NodeType, SceneStatus } from "@/schemas/nodes";
import { ProjectType } from "@/schemas/projects";
import { hasExactlyOneEndpoint } from "@/schemas/relationships";
import { checkGame } from "@/lib/controllers/game-objects";
import { UserFacingError } from "@/lib/controllers/errors";
import { isGameObjectKind, parseGameObject, unknownKindMessage, type GameObjectEntry } from "@/schemas/game-objects";

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
  /** Absent from exports made before game projects. */
  gameObjects?: Array<{
    kind: string;
    object: unknown;
    createdAt?: string;
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

const MAX_IMPORT_GAME_OBJECTS = 20_000;

// Bounded by the Postgres `int4` column, not NodeOrderIndex: node creation
// via `insertAfterIndex` is unbounded, so real exports can exceed that range.
const ImportedOrderIndex = z.number().int().min(-2_147_483_648).max(2_147_483_647);

// Free-form like WorldObject.type (copying a world object into a project
// carries its type over verbatim), so only a missing or blank type defaults.
const ImportedStoryObjectType = z.string().trim().min(1).catch("NOTE");

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
}

/** Validates game objects with the schema every save uses; they keep their ids, which rules name. */
function importableGameObjects(data: ExportData): { entry: GameObjectEntry; createdAt?: Date }[] {
  const gameObjects = data.gameObjects ?? [];
  if (!Array.isArray(gameObjects)) throw new ImportValidationError("gameObjects must be an array");
  if (gameObjects.length > MAX_IMPORT_GAME_OBJECTS) {
    throw new ImportValidationError(`gameObjects exceeds the maximum of ${MAX_IMPORT_GAME_OBJECTS}`);
  }
  if (!gameObjects.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))) {
    throw new ImportValidationError("gameObjects entries must be objects");
  }
  if (gameObjects.length > 0 && data.project.projectType !== "GAME") {
    throw new ImportValidationError("Only a GAME project has game objects");
  }
  const imported = gameObjects.map(({ kind, object, createdAt }) => {
    if (!isGameObjectKind(kind)) throw new ImportValidationError(unknownKindMessage(String(kind)));
    const parsed = parseGameObject(kind, object);
    if (!parsed.success) throw new ImportValidationError(`Invalid ${kind}: ${parsed.error}`);
    const time = Date.parse(createdAt ?? "");
    return { entry: parsed.entry, ...(!Number.isNaN(time) && { createdAt: new Date(time) }) };
  });
  try {
    checkGame(imported.map(({ entry }) => entry));
  } catch (error) {
    if (error instanceof UserFacingError) throw new ImportValidationError(`Invalid game objects: ${error.message}`);
    throw error;
  }
  return imported;
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
  const gameObjects = importableGameObjects(data);

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
      const content = sanitizeHtml(cv.content ?? "");
      await tx.contentVersion.create({
        data: {
          nodeId: newNodeId,
          content,
          wordCount: countSceneWords(content),
        },
      });
    }

    // 4. Create story objects
    for (const obj of data.storyObjects) {
      await tx.storyObject.create({
        data: {
          id: objectIdMap.get(obj.id)!,
          projectId,
          type: ImportedStoryObjectType.parse(obj.type),
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

    // 6. Create relationships, skipping any whose from or to side doesn't
    // resolve to exactly one node or object in this import
    const resolve = (map: Map<string, string>, id: string | null) => (id ? map.get(id) ?? null : null);
    for (const rel of data.relationships) {
      const fromNodeId = resolve(nodeIdMap, rel.fromNodeId);
      const fromObjectId = resolve(objectIdMap, rel.fromObjectId);
      const toNodeId = resolve(nodeIdMap, rel.toNodeId);
      const toObjectId = resolve(objectIdMap, rel.toObjectId);
      if (!hasExactlyOneEndpoint(fromNodeId, fromObjectId) || !hasExactlyOneEndpoint(toNodeId, toObjectId)) continue;
      await tx.relationship.create({
        data: {
          type: rel.type,
          label: sanitizeInput(rel.label ?? ""),
          fromNodeId,
          fromObjectId,
          toNodeId,
          toObjectId,
        },
      });
    }

    // 7. Create game objects; their created times keep the order the game lists them in
    for (const { entry, createdAt } of gameObjects) {
      const { id: key, ...object } = entry.object;
      await tx.gameObject.create({
        data: { projectId, kind: entry.kind, key, data: object as Prisma.InputJsonObject, ...(createdAt && { createdAt }) },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return { projectId };
}
