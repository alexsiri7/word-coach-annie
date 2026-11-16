import type { Prisma } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db";
import type { SceneBlock } from "@/lib/types";
import { computeContentHash } from "@/lib/content-hash";
import {
    flattenToParagraphs,
    paragraphHash,
    parseSceneContent,
    serializeSceneContent,
    validateSceneContent,
} from "@/lib/scene-document";
import { sanitizeHtml, sanitizeInput } from "@/lib/sanitize-server";
import { countSceneWords } from "@/lib/scene-text";
import { assertValidParent, lockProject } from "@/lib/node-tree";
import { NodeOrderIndex, NodeType, SceneStatus } from "@/schemas/nodes";
import { UserFacingError } from "@/lib/controllers/errors";
import { isHiddenOutlineScene } from "@/lib/outline-tree";

export class ConflictError extends UserFacingError {
  constructor(public serverContent: string) {
    super("Content conflict: server version has changed since last read");
    this.name = "ConflictError";
  }
}

export class InputTooLargeError extends UserFacingError {
  constructor(field: string, max: number) {
    super(`${field} exceeds the maximum length of ${max} characters`);
    this.name = "InputTooLargeError";
  }
}

export const ANNOTATION_ERRORS = {
    CONTENT_REQUIRED: "Content is required",
} as const;

export const MAX_SCENE_CONTENT_LENGTH = 2 * 1024 * 1024;

// A selection can span a whole scene, and a text-quote range is JSON that
// embeds the selected text, escaped, plus prefix/suffix.
export const MAX_ANNOTATION_LENGTHS = {
    content: 10_000,
    selectedText: MAX_SCENE_CONTENT_LENGTH,
    range: 2 * MAX_SCENE_CONTENT_LENGTH,
} as const;

function assertAnnotationWithinLimits(fields: { content: string; range?: string; selectedText?: string | null }) {
    for (const [field, max] of Object.entries(MAX_ANNOTATION_LENGTHS)) {
        const value = fields[field as keyof typeof MAX_ANNOTATION_LENGTHS];
        if (value && value.length > max) throw new InputTooLargeError(field, max);
    }
}

export const MAX_SCENE_VERSIONS = 50;

// The one definition of a scene's latest version: the hash a writer read and
// the hash checked under the lock must come from the same row on a createdAt tie.
const latestVersionFirst = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.ContentVersionOrderByWithRelationInput[];

async function pruneSceneVersions(tx: DbClient, nodeId: string) {
    const allVersions = await tx.contentVersion.findMany({
        where: { nodeId },
        orderBy: latestVersionFirst,
        select: { id: true },
    });

    if (allVersions.length > MAX_SCENE_VERSIONS) {
        const idsToDelete = allVersions.slice(MAX_SCENE_VERSIONS).map((v: { id: string }) => v.id);
        await tx.contentVersion.deleteMany({
            where: { id: { in: idsToDelete } },
        });
    }
}

// Row-locks the scene until the transaction commits, serializing every
// version write to it so a hash check can't be overtaken before its insert.
async function lockSceneNode(tx: DbClient, projectId: string, nodeId: string) {
    await lockProject(tx, projectId);
    await tx.structureNode.update({
        where: { id: nodeId },
        data: { updatedAt: new Date() },
    });
}

async function findSceneNode(nodeId: string) {
    const node = await prisma.structureNode.findUnique({
        where: { id: nodeId },
        select: { id: true, type: true, title: true, projectId: true },
    });
    if (!node) throw new UserFacingError("Node not found");
    if (node.type !== "SCENE") throw new UserFacingError("Content can only be written to SCENE nodes");
    return node;
}

function assertSceneContentSize(rawContent: string) {
    if (rawContent.length > MAX_SCENE_CONTENT_LENGTH) {
        throw new InputTooLargeError("Scene content", MAX_SCENE_CONTENT_LENGTH);
    }
}

function prepareSceneContent(rawContent: string) {
    validateSceneContent(rawContent);
    const content = sanitizeHtml(rawContent);
    return { content, wordCount: countSceneWords(content) };
}

// The one definition of a scene's current version: readers and the stale-write check must agree on it, ties included.
async function latestSceneVersion(db: DbClient, nodeId: string) {
    return db.contentVersion.findFirst({
        where: { nodeId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
}

function assertSeenLatest(latest: { content: string } | null, contentHash: string | null) {
    if (!latest) return;
    const seenLatest = contentHash === null
        ? latest.content === ""
        : computeContentHash(latest.content) === contentHash;
    if (!seenLatest) throw new ConflictError(latest.content);
}

async function createSceneVersion(tx: DbClient, nodeId: string, content: string, wordCount: number) {
    const version = await tx.contentVersion.create({
        data: { nodeId, content, wordCount },
    });
    await pruneSceneVersions(tx, nodeId);
    return version;
}

function sceneWriteResult(
    node: { title: string },
    nodeId: string,
    version: { id: string; createdAt: Date },
    content: string,
    wordCount: number,
) {
    return {
        nodeId,
        title: node.title,
        versionId: version.id,
        wordCount,
        contentHash: computeContentHash(content),
        createdAt: version.createdAt.toISOString(),
    };
}

export interface OutlineNode {
    id: string;
    type: string;
    title: string;
    synopsis: string;
    status: string;
    orderIndex: number;
    parentId: string | null;
    wordCount?: number;
    children: OutlineNode[];
    hasNewFeedback?: boolean;
}

async function runBatch<T, R>(
    items: T[],
    emptyLabel: string,
    maxLabel: string,
    fn: (item: T, index: number) => Promise<R>,
    describeError: (item: T, index: number) => Record<string, unknown>
): Promise<{ results: (R & { index: number; success: true })[]; errors: Record<string, unknown>[] }> {
    if (items.length === 0) throw new UserFacingError(`${emptyLabel} array must not be empty`);
    if (items.length > 50) throw new UserFacingError(`Maximum 50 ${maxLabel} per batch`);
    const results: (R & { index: number; success: true })[] = [];
    const errors: Record<string, unknown>[] = [];
    for (let i = 0; i < items.length; i++) {
        try {
            results.push({ index: i, success: true, ...(await fn(items[i], i)) });
        } catch (e) {
            errors.push({ index: i, success: false, ...describeError(items[i], i), error: e instanceof Error ? e.message : String(e) });
        }
    }
    return { results, errors };
}

export class StructureController {
    static async getOutline(projectId: string): Promise<OutlineNode[]> {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true },
        });
        if (!project) throw new UserFacingError("Project not found");

        const nodes = await prisma.structureNode.findMany({
            where: { projectId },
            orderBy: { orderIndex: "asc" },
            include: {
                contentVersions: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { wordCount: true },
                },
            },
        });

        // Find scene IDs with unresolved Google Docs annotations
        const newFeedbackAnnotations = await prisma.annotation.findMany({
            where: {
                node: { projectId },
                resolved: false,
                NOT: { externalId: null },
            },
            select: { nodeId: true },
        });
        const newFeedbackNodeIds = new Set(newFeedbackAnnotations.map((a: { nodeId: string }) => a.nodeId));

        const nodeMap = new Map<string, OutlineNode>();
        const roots: OutlineNode[] = [];

        for (const node of nodes) {
            nodeMap.set(node.id, {
                id: node.id,
                type: node.type,
                title: node.title,
                synopsis: node.synopsis,
                status: node.status,
                orderIndex: node.orderIndex,
                parentId: node.parentId,
                wordCount: node.type === "SCENE" ? (node.contentVersions[0]?.wordCount ?? 0) : undefined,
                children: [],
                hasNewFeedback: newFeedbackNodeIds.has(node.id),
            });
        }

        for (const node of nodes) {
            const outlineNode = nodeMap.get(node.id)!;
            if (node.parentId && nodeMap.has(node.parentId)) {
                nodeMap.get(node.parentId)!.children.push(outlineNode);
            } else {
                roots.push(outlineNode);
            }
        }

        // Sort children within each parent by orderIndex
        for (const node of nodeMap.values()) {
            if (node.children.length > 1) {
                node.children.sort((a, b) => a.orderIndex - b.orderIndex);
            }
        }
        roots.sort((a, b) => a.orderIndex - b.orderIndex);

        return roots;
    }

    static async createNode(params: {
        projectId: string;
        type: string;
        title: string;
        parentId?: string;
        synopsis?: string;
        status?: string;
        insertAfterIndex?: number;
    }) {
        const { projectId, type, title, parentId, synopsis, status, insertAfterIndex } = params;

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true },
        });
        if (!project) throw new UserFacingError("Project not found");

        if (!NodeType.safeParse(type).success) {
            throw new UserFacingError(`type must be one of: ${NodeType.options.join(", ")}`);
        }

        if (status && !SceneStatus.safeParse(status).success) {
            throw new UserFacingError(`status must be one of: ${SceneStatus.options.join(", ")}`);
        }

        if (parentId) {
            const parentNode = await prisma.structureNode.findFirst({
                where: { id: parentId, projectId },
            });
            if (!parentNode) throw new UserFacingError("Parent node not found in this project");
        }

        let orderIndex: number;
        if (insertAfterIndex !== undefined && insertAfterIndex !== null) {
            orderIndex = insertAfterIndex + 1;
            await prisma.structureNode.updateMany({
                where: {
                    projectId,
                    parentId: parentId ?? null,
                    orderIndex: { gte: orderIndex },
                },
                data: { orderIndex: { increment: 1 } },
            });
        } else {
            const lastSibling = await prisma.structureNode.findFirst({
                where: { projectId, parentId: parentId ?? null },
                orderBy: { orderIndex: "desc" },
                select: { orderIndex: true },
            });
            orderIndex = lastSibling ? lastSibling.orderIndex + 1 : 0;
        }

        const node = await prisma.structureNode.create({
            data: {
                projectId,
                type,
                title,
                parentId: parentId ?? null,
                synopsis: synopsis ?? "",
                status: status ?? "OUTLINE",
                orderIndex,
            },
        });

        const createPromises: Promise<unknown>[] = [
            prisma.project.update({
                where: { id: projectId },
                data: { updatedAt: new Date() },
            }),
        ];
        if (type === "SCENE") {
            createPromises.push(
                prisma.contentVersion.create({
                    data: { nodeId: node.id, content: "", wordCount: 0 },
                })
            );
        }
        await Promise.all(createPromises);

        return {
            id: node.id,
            type: node.type,
            title: node.title,
            synopsis: node.synopsis,
            status: node.status,
            orderIndex: node.orderIndex,
            parentId: node.parentId,
        };
    }

    static async updateNode(
        nodeId: string,
        data: {
            title?: string;
            synopsis?: string;
            status?: string;
            orderIndex?: number;
            parentId?: string | null;
        }
    ) {
        const existing = await prisma.structureNode.findUnique({ where: { id: nodeId } });
        if (!existing) throw new UserFacingError("Node not found");

        if (data.status && !SceneStatus.safeParse(data.status).success) {
            throw new UserFacingError(`status must be one of: ${SceneStatus.options.join(", ")}`);
        }

        if (data.orderIndex !== undefined) {
            const orderIndex = NodeOrderIndex.safeParse(data.orderIndex);
            if (!orderIndex.success) throw new UserFacingError(`orderIndex: ${orderIndex.error.issues[0].message}`);
        }

        const updateData: Record<string, unknown> = {};
        if (data.title !== undefined) updateData.title = data.title;
        if (data.synopsis !== undefined) updateData.synopsis = data.synopsis;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.orderIndex !== undefined) updateData.orderIndex = data.orderIndex;
        if (data.parentId !== undefined) updateData.parentId = data.parentId;

        if (Object.keys(updateData).length === 0) {
            throw new UserFacingError("No fields to update");
        }

        const node = await prisma.$transaction(async (tx) => {
            await lockProject(tx, existing.projectId);
            if (data.parentId !== undefined && data.parentId !== null) await assertValidParent(tx, existing, data.parentId);
            return tx.structureNode.update({
                where: { id: nodeId },
                data: updateData,
            });
        });

        return {
            id: node.id,
            type: node.type,
            title: node.title,
            synopsis: node.synopsis,
            status: node.status,
            orderIndex: node.orderIndex,
            parentId: node.parentId,
        };
    }

    static async deleteNode(nodeId: string) {
        const node = await prisma.structureNode.findUnique({ where: { id: nodeId } });
        if (!node) throw new UserFacingError("Node not found");

        await Promise.all([
            prisma.structureNode.delete({ where: { id: nodeId } }),
            prisma.project.update({
                where: { id: node.projectId },
                data: { updatedAt: new Date() },
            }),
        ]);

        const siblings = await prisma.structureNode.findMany({
            where: { projectId: node.projectId, parentId: node.parentId },
            orderBy: { orderIndex: "asc" },
            select: { id: true },
        });

        for (let i = 0; i < siblings.length; i++) {
            await prisma.structureNode.update({
                where: { id: siblings[i].id },
                data: { orderIndex: i },
            });
        }

        return { deleted: true, id: nodeId, title: node.title };
    }

    /** Limits apply to the input as given; `sanitize` escapes it afterwards, which can lengthen it. */
    static async addAnnotation(
        nodeId: string,
        content: string,
        range: string = "",
        selectedText: string | null = null,
        { sanitize = false }: { sanitize?: boolean } = {}
    ) {
        assertAnnotationWithinLimits({ content, range, selectedText });
        if (sanitize) {
            content = sanitizeInput(content);
            if (selectedText) selectedText = sanitizeInput(selectedText);
        }
        if (!content) throw new UserFacingError(ANNOTATION_ERRORS.CONTENT_REQUIRED);

        // Explicit ID provided as a workaround for Prisma client not applying @default(cuid())
        // in this context; crypto.randomUUID() is cryptographically secure and globally unique.
        const annotation = await prisma.annotation.create({
            data: {
                id: crypto.randomUUID(),
                nodeId,
                content,
                range,
                selectedText,
                updatedAt: new Date(),
            },
        });

        return annotation;
    }

    static async getNode(nodeId: string) {
        const node = await prisma.structureNode.findUnique({ where: { id: nodeId } });
        if (!node) throw new UserFacingError("Node not found");
        return node;
    }

    static async readSceneContent(nodeId: string) {
        const node = await prisma.structureNode.findUnique({
            where: { id: nodeId },
            select: { id: true, type: true, title: true },
        });
        if (!node) throw new UserFacingError("Node not found");

        const version = await latestSceneVersion(prisma, nodeId);

        const annotations = await prisma.annotation.findMany({
            where: { nodeId },
            orderBy: { createdAt: "asc" },
        });

        const content = version?.content ?? "";

        return {
            nodeId,
            title: node.title,
            content: content,
            blocks: parseSceneContent(content),
            wordCount: version?.wordCount ?? 0,
            versionId: version?.id ?? null,
            lastModified: version?.createdAt.toISOString() ?? null,
            annotations: annotations.map((a: { id: string; content: string; resolved: boolean; range: string; createdAt: Date }) => ({
                id: a.id,
                content: a.content,
                resolved: a.resolved,
                range: a.range,
                createdAt: a.createdAt.toISOString()
            }))
        };
    }

    /**
     * `contentHash` is the hash of the latest version the writer has seen:
     * `undefined` writes unchecked. A string must match the latest stored
     * version; `null` means "no content seen" and only matches a latest version
     * that is empty (new scenes start with one). Either throws ConflictError on
     * mismatch; a write with no stored version is always allowed.
     */
    static async writeSceneContent(nodeId: string, rawContent: string, contentHash?: string | null) {
        assertSceneContentSize(rawContent);
        const node = await findSceneNode(nodeId);
        const { content, wordCount } = prepareSceneContent(rawContent);

        const version = await prisma.$transaction(async (tx) => {
            await lockSceneNode(tx, node.projectId, nodeId);
            if (contentHash !== undefined) {
                assertSeenLatest(await latestSceneVersion(tx, nodeId), contentHash);
            }
            return createSceneVersion(tx, nodeId, content, wordCount);
        });

        return sceneWriteResult(node, nodeId, version, content, wordCount);
    }

    static async writeSceneContentFromBlocks(nodeId: string, blocks: SceneBlock[], contentHash?: string | null) {
        return StructureController.writeSceneContent(nodeId, serializeSceneContent(blocks), contentHash);
    }

    /**
     * Applies `edit` to the scene's latest blocks under the scene's row lock, so
     * the snapshot that is hash-checked is the one that is edited. `expected`
     * carries the hashes the writer read: `sceneContentHash` follows
     * writeSceneContent's rules, and `paragraph` must match that paragraph's
     * current hash (an out-of-range index is left for `edit` to reject).
     * Either mismatch throws ConflictError.
     */
    static async editScene(
        nodeId: string,
        edit: (blocks: SceneBlock[]) => SceneBlock[],
        expected: { sceneContentHash?: string; paragraph?: { index: number; contentHash: string } } = {},
    ) {
        const node = await findSceneNode(nodeId);

        const { version, content, wordCount } = await prisma.$transaction(async (tx) => {
            await lockSceneNode(tx, node.projectId, nodeId);
            const latest = await latestSceneVersion(tx, nodeId);
            if (expected.sceneContentHash !== undefined) assertSeenLatest(latest, expected.sceneContentHash);

            const current = latest?.content ?? "";
            const blocks = parseSceneContent(current);
            if (expected.paragraph) {
                const target = flattenToParagraphs(blocks)[expected.paragraph.index];
                if (target && paragraphHash(target) !== expected.paragraph.contentHash) {
                    throw new ConflictError(current);
                }
            }

            const rawContent = serializeSceneContent(edit(blocks));
            assertSceneContentSize(rawContent);
            const prepared = prepareSceneContent(rawContent);
            const created = await createSceneVersion(tx, nodeId, prepared.content, prepared.wordCount);
            return { version: created, ...prepared };
        });

        return sceneWriteResult(node, nodeId, version, content, wordCount);
    }

    static async getSceneVersions(nodeId: string, limit: number = 20) {
        const node = await prisma.structureNode.findUnique({
            where: { id: nodeId },
            select: { id: true, title: true },
        });
        if (!node) throw new UserFacingError("Node not found");

        const versions = await prisma.contentVersion.findMany({
            where: { nodeId },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { id: true, wordCount: true, createdAt: true },
        });

        return {
            nodeId,
            title: node.title,
            versions: versions.map((v: { id: string; wordCount: number; createdAt: Date }) => ({
                id: v.id,
                wordCount: v.wordCount,
                createdAt: v.createdAt.toISOString(),
            })),
        };
    }

    static async restoreSceneVersion(nodeId: string, versionId: string) {
        const node = await prisma.structureNode.findUnique({
            where: { id: nodeId },
            select: { id: true, title: true, projectId: true },
        });
        if (!node) throw new UserFacingError("Node not found");

        const oldVersion = await prisma.contentVersion.findFirst({
            where: { id: versionId, nodeId },
        });
        if (!oldVersion) throw new UserFacingError("Version not found");

        // Versions stored before every write path sanitized may still carry unsafe markup.
        const content = sanitizeHtml(oldVersion.content);

        const newVersion = await prisma.$transaction(async (tx) => {
            await lockSceneNode(tx, node.projectId, nodeId);

            const created = await tx.contentVersion.create({
                data: { nodeId, content, wordCount: countSceneWords(content) },
            });

            await pruneSceneVersions(tx, nodeId);

            return created;
        });

        return {
            nodeId,
            title: node.title,
            restoredFromVersionId: versionId,
            newVersionId: newVersion.id,
            wordCount: newVersion.wordCount,
            content: newVersion.content,
            contentHash: computeContentHash(newVersion.content),
            createdAt: newVersion.createdAt.toISOString(),
        };
    }

    static async resolveAnnotation(annotationId: string, resolved: boolean) {
        return prisma.annotation.update({
            where: { id: annotationId },
            data: { resolved },
        });
    }

    static async updateAnnotation(annotationId: string, data: { content?: string; resolved?: boolean }) {
        return prisma.annotation.update({
            where: { id: annotationId },
            data,
        });
    }

    static async deleteAnnotation(annotationId: string) {
        return prisma.annotation.delete({
            where: { id: annotationId },
        });
    }
    static async batchCreateNodes(
        projectId: string,
        nodes: Array<{
            type: string;
            title: string;
            parentId?: string;
            synopsis?: string;
            status?: string;
        }>
    ) {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true },
        });
        if (!project) throw new UserFacingError("Project not found");

        const { results, errors } = await runBatch(
            nodes,
            "nodes",
            "nodes",
            (node) => StructureController.createNode({ projectId, ...node }),
            (node) => ({ title: node.title })
        );

        return { created: results, errors, totalCreated: results.length, totalErrors: errors.length };
    }

    static async batchUpdateNodes(
        updates: Array<{
            nodeId: string;
            title?: string;
            synopsis?: string;
            status?: string;
            orderIndex?: number;
            parentId?: string | null;
        }>
    ) {
        const { results, errors } = await runBatch(
            updates,
            "updates",
            "updates",
            ({ nodeId, ...data }) => StructureController.updateNode(nodeId, data),
            ({ nodeId }) => ({ nodeId })
        );

        return { updated: results, errors, totalUpdated: results.length, totalErrors: errors.length };
    }

    static async batchDeleteNodes(nodeIds: string[]) {
        const { results, errors } = await runBatch(
            nodeIds,
            "nodeIds",
            "deletions",
            (nodeId) => StructureController.deleteNode(nodeId),
            (nodeId) => ({ nodeId })
        );

        return { deleted: results, errors, totalDeleted: results.length, totalErrors: errors.length };
    }

    static async getOpenAnnotations(
        projectId?: string,
        userId?: string | null,
        { excludeOutlineScenes = false }: { excludeOutlineScenes?: boolean } = {},
    ) {
        const where: Record<string, unknown> = { resolved: false };
        if (projectId) {
            where.node = { projectId };
        } else if (userId) {
            // Never return other tenants' annotations when no projectId is given.
            where.node = { project: { userId } };
        }

        const annotations = await prisma.annotation.findMany({
            where,
            include: {
                node: {
                    select: {
                        id: true,
                        title: true,
                        type: true,
                        status: true,
                        project: { select: { title: true } }
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        });
        const visible = excludeOutlineScenes
            ? annotations.filter((a) => !isHiddenOutlineScene(a.node))
            : annotations;

        return visible.map((a) => ({
            id: a.id,
            content: a.content,
            nodeId: a.nodeId,
            nodeTitle: a.node.title,
            projectTitle: a.node.project.title,
            selectedText: a.selectedText,
            createdAt: a.createdAt.toISOString()
        }));
    }
}
