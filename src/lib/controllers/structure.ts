import { prisma } from "@/lib/db";
import { autoSnapshot } from "../../mcp/snapshot";
import type { SceneBlock } from "@/lib/types";

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
}

export class StructureController {
    static parseSceneContent(content: string): SceneBlock[] {
        const blocks: SceneBlock[] = [];
        const regex = /(<!-- beat:[\s\S]*?-->)/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(content)) !== null) {
            // Content before the beat
            if (match.index > lastIndex) {
                const text = content.substring(lastIndex, match.index);
                if (text) {
                    blocks.push({ type: "CONTENT", content: text });
                }
            }

            // The beat itself
            const beatComment = match[1];
            // Extract content inside <!-- beat: ... -->
            const beatContent = beatComment.replace(/^<!-- beat:\s*/, "").replace(/\s*-->$/, "");
            blocks.push({ type: "BEAT", content: beatContent });

            lastIndex = regex.lastIndex;
        }

        // Remaining content
        if (lastIndex < content.length) {
            blocks.push({ type: "CONTENT", content: content.substring(lastIndex) });
        }

        return blocks;
    }

    static serializeSceneContent(blocks: SceneBlock[]): string {
        return blocks.map(block => {
            if (block.type === "BEAT") {
                return `<!-- beat: ${block.content.trim()} -->`;
            }
            return block.content;
        }).join("");
    }

    private static validateSceneContent(content: string) {
        // Validate beats: ensure they don't contain nested comments or broken syntax
        // Simple check: count of "<!-- beat:" must match count of "-->" (roughly)
        // Better: ensure every "<!-- beat:" is closed by "-->" and no nesting.

        const openBeats = (content.match(/<!-- beat:/g) || []).length;
        const closeComments = (content.match(/-->/g) || []).length;

        // This is a loose check because "-->" checks for any comment closure.
        // But since we only use comments for beats mostly, it's a good heuristic.
        // If content has normal HTML comments, this might be strict. 
        // But we want to discourage manual HTML comments in scenes anyway.

        if (content.includes("<!-- beat:")) {
            // Basic structure check
            const segments = content.split("<!-- beat:");
            for (let i = 1; i < segments.length; i++) {
                const segment = segments[i];
                const closeIndex = segment.indexOf("-->");
                if (closeIndex === -1) {
                    throw new Error("Malformed scene content: Unclosed beat annotation found.");
                }
                // Check for nesting
                if (segment.substring(0, closeIndex).includes("<!--")) {
                    throw new Error("Malformed scene content: Nested comments in beats are not allowed.");
                }
            }
        }
    }

    static async getOutline(projectId: string): Promise<OutlineNode[]> {
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

    static async deleteNode(nodeId: string) {
        const node = await prisma.structureNode.findUnique({ where: { id: nodeId } });
        if (!node) throw new Error(`Node not found: ${nodeId}`);

        // Note: autoSnapshot might need to be passed in or handled differently if we want to isolate dependencies
        // For now, we assume this is running in an environment where autoSnapshot works or handles itself gracefully.
        // If this is running in pure Next.js API, we might need to adjust or make snapshot optional/backend-only.
        try {
            // We can keep it if it's safe, or conditionally run it.
            // Given the repo structure, mcp code is imported in standard code.
            autoSnapshot("delete_node", node.title);
        } catch (e) {
            console.warn("Snapshot failed or not available:", e);
        }

        await prisma.structureNode.delete({ where: { id: nodeId } });

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

    static async addAnnotation(nodeId: string, content: string, range: string = "", selectedText: string | null = null) {
        if (!content) throw new Error("Content is required");

        // Manual ID and timestamp generation as a workaround for Prisma client issues
        const annotation = await prisma.annotation.create({
            data: {
                id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                nodeId,
                content,
                range,
                selectedText,
                updatedAt: new Date(),
            },
        });

        return annotation;
    }

    static async readSceneContent(nodeId: string) {
        const node = await prisma.structureNode.findUnique({
            where: { id: nodeId },
            select: { id: true, type: true, title: true },
        });
        if (!node) throw new Error(`Node not found: ${nodeId}`);

        const version = await prisma.contentVersion.findFirst({
            where: { nodeId },
            orderBy: { createdAt: "desc" },
        });

        const annotations = await prisma.annotation.findMany({
            where: { nodeId },
            orderBy: { createdAt: "asc" },
        });

        const content = version?.content ?? "";

        return {
            nodeId,
            title: node.title,
            content: content,
            blocks: StructureController.parseSceneContent(content),
            wordCount: version?.wordCount ?? 0,
            versionId: version?.id ?? null,
            lastModified: version?.createdAt.toISOString() ?? null,
            annotations: annotations.map((a: any) => ({
                id: a.id,
                content: a.content,
                resolved: a.resolved,
                range: a.range,
                createdAt: a.createdAt.toISOString()
            }))
        };
    }

    static async writeSceneContent(nodeId: string, content: string) {
        const node = await prisma.structureNode.findUnique({
            where: { id: nodeId },
            select: { id: true, type: true, title: true },
        });
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        if (node.type !== "SCENE") throw new Error("Content can only be written to SCENE nodes");

        StructureController.validateSceneContent(content);

        const prose = content.replace(/(<!-- beat:[\s\S]*?-->)/g, "").trim();
        const wordCount = prose === "" ? 0 : prose.split(/\s+/).length;

        const version = await prisma.contentVersion.create({
            data: { nodeId, content, wordCount },
        });

        // Prune old versions (keep latest 50)
        const allVersions = await prisma.contentVersion.findMany({
            where: { nodeId },
            orderBy: { createdAt: "desc" },
            select: { id: true },
        });

        if (allVersions.length > 50) {
            const idsToDelete = allVersions.slice(50).map((v: { id: string }) => v.id);
            await prisma.contentVersion.deleteMany({
                where: { id: { in: idsToDelete } },
            });
        }

        return {
            nodeId,
            title: node.title,
            versionId: version.id,
            wordCount,
            createdAt: version.createdAt.toISOString(),
        };
    }

    static async writeSceneContentFromBlocks(nodeId: string, blocks: SceneBlock[]) {
        const content = StructureController.serializeSceneContent(blocks);
        return StructureController.writeSceneContent(nodeId, content);
    }

    static async getSceneVersions(nodeId: string, limit: number = 20) {
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
            versions: versions.map((v: any) => ({
                id: v.id,
                wordCount: v.wordCount,
                createdAt: v.createdAt.toISOString(),
            })),
        };
    }

    static async restoreSceneVersion(nodeId: string, versionId: string) {
        const node = await prisma.structureNode.findUnique({
            where: { id: nodeId },
            select: { id: true, title: true },
        });
        if (!node) throw new Error(`Node not found: ${nodeId}`);

        const oldVersion = await prisma.contentVersion.findFirst({
            where: { id: versionId, nodeId },
        });
        if (!oldVersion) throw new Error(`Version not found: ${versionId}`);

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
    static async getOpenAnnotations(projectId?: string) {
        const where: any = { resolved: false };
        if (projectId) {
            where.node = { projectId };
        }

        const annotations = await prisma.annotation.findMany({
            where,
            include: {
                node: {
                    select: {
                        id: true,
                        title: true,
                        project: { select: { title: true } }
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        });

        return annotations.map((a: any) => ({
            id: a.id,
            content: a.content,
            nodeId: a.nodeId,
            nodeTitle: a.node.title,
            projectTitle: a.node.project.title,
            createdAt: a.createdAt.toISOString()
        }));
    }
}
