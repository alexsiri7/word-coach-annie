import { prisma } from "@/lib/db";
import type { StructureNode, StoryObject, Relationship } from "@/lib/types";

export interface TimelineData {
    scenes: StructureNode[];
    objects: StoryObject[];
    events: Relationship[];
}

export class TimelineController {

    static async getTimelineData(projectId: string): Promise<TimelineData> {
        // 1. Fetch all structure nodes for the project to rebuild hierarchy
        const allNodes = await prisma.structureNode.findMany({
            where: { projectId },
            orderBy: { orderIndex: "asc" },
        });

        // 2. Build tree and flatten scenes in order
        const nodeMap = new Map<string, StructureNode>();
        const childrenMap = new Map<string, StructureNode[]>();
        const rootNodes: StructureNode[] = [];

        // Initialize maps
        allNodes.forEach((node) => {
            nodeMap.set(node.id, node as unknown as StructureNode);
            if (!childrenMap.has(node.id)) {
                childrenMap.set(node.id, []);
            }
        });

        // Build hierarchy
        allNodes.forEach((node) => {
            if (node.parentId) {
                const siblings = childrenMap.get(node.parentId);
                if (siblings) {
                    siblings.push(node as unknown as StructureNode);
                    // Sort siblings by orderIndex just to be safe (though DB query helped)
                    siblings.sort((a, b) => a.orderIndex - b.orderIndex);
                }
            } else {
                rootNodes.push(node as unknown as StructureNode);
            }
        });

        // Sort roots
        rootNodes.sort((a, b) => a.orderIndex - b.orderIndex);

        // Recursive traversal to collect scenes in order
        const sortedScenes: StructureNode[] = [];

        const traverse = (node: StructureNode) => {
            if (node.type === "SCENE") {
                sortedScenes.push(node);
            }

            const children = childrenMap.get(node.id) || [];
            children.forEach(traverse);
        };

        rootNodes.forEach(traverse);

        // 3. Fetch all story objects
        const objects = await prisma.storyObject.findMany({
            where: {
                projectId,
            },
            orderBy: {
                name: "asc",
            },
        });

        // 4. Fetch relationships connecting these objects to these scenes
        const sceneIds = sortedScenes.map((s) => s.id);
        const objectIds = objects.map((o) => o.id);

        const events = await prisma.relationship.findMany({
            where: {
                OR: [
                    {
                        fromObjectId: { in: objectIds },
                        toNodeId: { in: sceneIds },
                    },
                    {
                        fromNodeId: { in: sceneIds },
                        toObjectId: { in: objectIds },
                    },
                ],
            },
            include: {
                fromObject: true,
                toNode: true,
                fromNode: true,
                toObject: true
            }
        });

        return {
            scenes: sortedScenes,
            objects: objects as unknown as StoryObject[],
            events: events as unknown as Relationship[],
        };
    }
}
