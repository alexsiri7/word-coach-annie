import { prisma } from "@/lib/db";
import type { StructureNode, StoryObject, Relationship } from "@/lib/types";

export interface TimelineData {
    scenes: StructureNode[];
    objects: StoryObject[];
    events: Relationship[];
}

export class TimelineController {

    static async getTimelineData(projectId: string): Promise<TimelineData> {
        // 1. Fetch scenes in order
        const scenes = await prisma.structureNode.findMany({
            where: {
                projectId,
                type: "SCENE",
            },
            orderBy: {
                orderIndex: "asc",
            },
        });

        // 2. Fetch all story objects
        const objects = await prisma.storyObject.findMany({
            where: {
                projectId,
            },
            orderBy: {
                name: "asc",
            },
        });

        // 3. Fetch relationships connecting these objects to these scenes
        // We want relationships where source is an object and target is a scene, OR vice versa.
        // For simplicity, let's just fetch all relationships involving the project's objects and scenes.
        // However, relationships link two node IDs.
        // A StoryObject has an ID. A StructureNode has an ID.
        // The link is stored in the Relationship table: sourceId, targetId.

        const sceneIds = scenes.map((s) => s.id);
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

        // Map Prisma result to our internal types if necessary
        // Assuming simple mapping is okay for now.
        // Note: Prisma returns dates as Date objects, but our types might expect strings.
        // We should ensure the return type matches what the client expects (usually JSON with strings).
        // For the server component or API route, we return plain objects.

        return {
            scenes: scenes as unknown as StructureNode[],
            objects: objects as unknown as StoryObject[],
            events: events as unknown as Relationship[],
        };
    }
}
