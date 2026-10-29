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

/** READER shares and the manuscript Read view never see the text of OUTLINE scenes (#1259). */
export function isHiddenOutlineScene(node: { type: string; status: string }): boolean {
    return node.type === "SCENE" && node.status === "OUTLINE";
}

export async function buildOutlineTree(
    projectId: string,
    { excludeOutlineScenes = false }: { excludeOutlineScenes?: boolean } = {},
): Promise<OutlineNode[]> {
    const allNodes = await prisma.structureNode.findMany({
        where: { projectId },
        orderBy: { orderIndex: "asc" },
    });
    const nodes = excludeOutlineScenes
        ? allNodes.filter((n) => !isHiddenOutlineScene(n))
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
