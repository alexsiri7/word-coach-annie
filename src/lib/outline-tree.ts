import { prisma } from "@/lib/db";

export interface OutlineNode {
    id: string;
    type: string;
    title: string;
    synopsis: string;
    status: string;
    orderIndex: number;
    parentId: string | null;
    children: OutlineNode[];
    content?: string;
}

export async function buildOutlineTree(projectId: string): Promise<OutlineNode[]> {
    const nodes = await prisma.structureNode.findMany({
        where: { projectId },
        orderBy: { orderIndex: "asc" },
    });

    const sceneIds = nodes.filter((n: { type: string }) => n.type === "SCENE").map((n: { id: string }) => n.id);
    const contentMap: Record<string, string> = {};

    if (sceneIds.length > 0) {
        const allVersions = await prisma.contentVersion.findMany({
            where: { nodeId: { in: sceneIds } },
            orderBy: { createdAt: "desc" },
            select: { nodeId: true, content: true },
        });

        // First match per nodeId is latest due to orderBy desc
        for (const v of allVersions) {
            if (!(v.nodeId in contentMap)) {
                contentMap[v.nodeId] = v.content;
            }
        }
    }

    const nodeMap = new Map<string, OutlineNode>();
    const roots: OutlineNode[] = [];

    for (const node of nodes) {
        nodeMap.set(node.id, {
            ...node,
            children: [],
            content: contentMap[node.id],
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
