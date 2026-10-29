import { prisma } from "@/lib/db";
import { getLatestContent } from "@/lib/latest-content";

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

export async function buildOutlineTree(
    projectId: string,
    { excludeOutlineScenes = false }: { excludeOutlineScenes?: boolean } = {},
): Promise<OutlineNode[]> {
    const allNodes = await prisma.structureNode.findMany({
        where: { projectId },
        orderBy: { orderIndex: "asc" },
    });
    // READER shares never see OUTLINE scenes (#1259); same predicate as the manuscript Read view.
    const nodes = excludeOutlineScenes
        ? allNodes.filter((n) => n.type !== "SCENE" || n.status !== "OUTLINE")
        : allNodes;

    const sceneIds = nodes.filter((n: { type: string }) => n.type === "SCENE").map((n: { id: string }) => n.id);
    const contentMap = await getLatestContent(sceneIds);

    const nodeMap = new Map<string, OutlineNode>();
    const roots: OutlineNode[] = [];

    for (const node of nodes) {
        nodeMap.set(node.id, {
            ...node,
            children: [],
            content: contentMap.get(node.id),
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
