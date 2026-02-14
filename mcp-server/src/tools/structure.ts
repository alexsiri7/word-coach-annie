import { prisma } from "../db.js";
import { autoSnapshot } from "../snapshot.js";

interface OutlineNode {
    id: string;
    type: string;
    title: string;
    synopsis: string;
    status: string;
    orderIndex: number;
    parentId: string | null;
    wordCount?: number;
    children: OutlineNode[];
}

export async function getOutline(projectId: string): Promise<OutlineNode[]> {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
    });
    if (!project) throw new Error(`Project not found: ${projectId}`);

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

    // Build tree
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

    return roots;
}

export async function createNode(params: {
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
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const validTypes = ["PART", "CHAPTER", "SCENE"];
    if (!validTypes.includes(type)) {
        throw new Error(`type must be one of: ${validTypes.join(", ")}`);
    }

    const validStatuses = ["OUTLINE", "DRAFT", "REVISED", "FINAL"];
    if (status && !validStatuses.includes(status)) {
        throw new Error(`status must be one of: ${validStatuses.join(", ")}`);
    }

    if (parentId) {
        const parentNode = await prisma.structureNode.findFirst({
            where: { id: parentId, projectId },
        });
        if (!parentNode) throw new Error("Parent node not found in this project");
    }

    // Calculate orderIndex
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

    // Create initial empty content version for scenes
    if (type === "SCENE") {
        await prisma.contentVersion.create({
            data: { nodeId: node.id, content: "", wordCount: 0 },
        });
    }

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

export async function updateNode(
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
    if (!existing) throw new Error(`Node not found: ${nodeId}`);

    const validStatuses = ["OUTLINE", "DRAFT", "REVISED", "FINAL"];
    if (data.status && !validStatuses.includes(data.status)) {
        throw new Error(`status must be one of: ${validStatuses.join(", ")}`);
    }

    if (data.parentId !== undefined && data.parentId !== null) {
        if (data.parentId === nodeId) throw new Error("A node cannot be its own parent");
        const parentNode = await prisma.structureNode.findFirst({
            where: { id: data.parentId, projectId: existing.projectId },
        });
        if (!parentNode) throw new Error("Parent node not found in this project");
    }

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.synopsis !== undefined) updateData.synopsis = data.synopsis;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.orderIndex !== undefined) updateData.orderIndex = data.orderIndex;
    if (data.parentId !== undefined) updateData.parentId = data.parentId;

    if (Object.keys(updateData).length === 0) {
        throw new Error("No fields to update");
    }

    const node = await prisma.structureNode.update({
        where: { id: nodeId },
        data: updateData,
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

export async function deleteNode(nodeId: string) {
    const node = await prisma.structureNode.findUnique({ where: { id: nodeId } });
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    // Auto-snapshot before deletion
    autoSnapshot("delete_node", node.title);

    await prisma.structureNode.delete({ where: { id: nodeId } });

    // Reindex siblings
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

// --- Scene Content ---

export async function readSceneContent(nodeId: string) {
    const node = await prisma.structureNode.findUnique({
        where: { id: nodeId },
        select: { id: true, type: true, title: true },
    });
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    const version = await prisma.contentVersion.findFirst({
        where: { nodeId },
        orderBy: { createdAt: "desc" },
    });

    return {
        nodeId,
        title: node.title,
        content: version?.content ?? "",
        wordCount: version?.wordCount ?? 0,
        versionId: version?.id ?? null,
        lastModified: version?.createdAt.toISOString() ?? null,
    };
}

export async function writeSceneContent(nodeId: string, content: string) {
    const node = await prisma.structureNode.findUnique({
        where: { id: nodeId },
        select: { id: true, type: true, title: true },
    });
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (node.type !== "SCENE") throw new Error("Content can only be written to SCENE nodes");

    const wordCount = content.trim() === "" ? 0 : content.trim().split(/\s+/).length;

    const version = await prisma.contentVersion.create({
        data: { nodeId, content, wordCount },
    });

    return {
        nodeId,
        title: node.title,
        versionId: version.id,
        wordCount,
        createdAt: version.createdAt.toISOString(),
    };
}

export async function getSceneVersions(nodeId: string, limit: number = 20) {
    const node = await prisma.structureNode.findUnique({
        where: { id: nodeId },
        select: { id: true, title: true },
    });
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    const versions = await prisma.contentVersion.findMany({
        where: { nodeId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, wordCount: true, createdAt: true },
    });

    return {
        nodeId,
        title: node.title,
        versions: versions.map((v) => ({
            id: v.id,
            wordCount: v.wordCount,
            createdAt: v.createdAt.toISOString(),
        })),
    };
}

export async function restoreSceneVersion(nodeId: string, versionId: string) {
    const node = await prisma.structureNode.findUnique({
        where: { id: nodeId },
        select: { id: true, title: true },
    });
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    const oldVersion = await prisma.contentVersion.findFirst({
        where: { id: versionId, nodeId },
    });
    if (!oldVersion) throw new Error(`Version not found: ${versionId}`);

    // Create a new version from the old content
    const newVersion = await prisma.contentVersion.create({
        data: {
            nodeId,
            content: oldVersion.content,
            wordCount: oldVersion.wordCount,
        },
    });

    return {
        nodeId,
        title: node.title,
        restoredFromVersionId: versionId,
        newVersionId: newVersion.id,
        wordCount: newVersion.wordCount,
        createdAt: newVersion.createdAt.toISOString(),
    };
}
