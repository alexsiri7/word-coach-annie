import { prisma } from "@/lib/db";

export class FocusController {
    static async getSceneContext(sceneId: string) {
        const scene = await prisma.structureNode.findUnique({
            where: { id: sceneId },
            include: {
                project: { select: { title: true, id: true } },
            },
        });

        if (!scene) throw new Error(`Scene not found: ${sceneId}`);

        // Get adjacent scenes ordered by chapter then scene position
        const siblings = await prisma.structureNode.findMany({
            where: {
                projectId: scene.projectId,
                type: "SCENE"
            },
            orderBy: [
                { parent: { orderIndex: "asc" } },
                { orderIndex: "asc" }
            ],
            select: { id: true, title: true, orderIndex: true }
        });

        const currentIndex = siblings.findIndex(s => s.id === sceneId);
        const prevScene = currentIndex > 0 ? siblings[currentIndex - 1] : null;
        const nextScene = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

        // Get word count from latest version
        const version = await prisma.contentVersion.findFirst({
            where: { nodeId: sceneId },
            orderBy: { createdAt: "desc" },
            select: { wordCount: true }
        });

        // Get parent chapter title if exists
        let chapterTitle = null;
        if (scene.parentId) {
            const parent = await prisma.structureNode.findUnique({
                where: { id: scene.parentId },
                select: { title: true }
            });
            chapterTitle = parent?.title || null;
        }

        return {
            id: scene.id,
            title: scene.title,
            synopsis: scene.synopsis,
            status: scene.status,
            projectId: scene.projectId,
            projectTitle: scene.project.title,
            chapterTitle,
            wordCount: version?.wordCount || 0,
            prevScene: prevScene ? { id: prevScene.id, title: prevScene.title } : null,
            nextScene: nextScene ? { id: nextScene.id, title: nextScene.title } : null,
        };
    }

    static async getRelatedElements(sceneId: string) {
        // Fetch relationships where this scene is a target or source
        // In our current model, relationships link nodes (scenes/chapters) to objects (chars/locs).
        // Usually: Scene -> Character (Appearances), Scene -> Location (Setting), etc.

        const relationships = await prisma.relationship.findMany({
            where: {
                OR: [
                    { fromNodeId: sceneId },
                    { toNodeId: sceneId }
                ]
            },
            include: {
                fromObject: true,
                toObject: true,
            }
        });

        const relatedObjects: { id: string; type: string; name: string; description: string | null; role: string | null; notes: string | null; tags: string | null }[] = [];
        const seenIds = new Set<string>();

        for (const rel of relationships) {
            // Determine which side is the story object
            const obj = rel.fromObject || rel.toObject;
            if (obj && !seenIds.has(obj.id)) {
                relatedObjects.push({
                    id: obj.id,
                    type: obj.type,
                    name: obj.name,
                    description: obj.description,
                    role: obj.role,
                    notes: obj.notes,
                    tags: obj.tags
                });
                seenIds.add(obj.id);
            }
        }

        // Group by type
        const grouped: Record<string, typeof relatedObjects> = {
            CHARACTER: [],
            LOCATION: [],
            PLOTLINE: [],
            WORLD_ELEMENT: [],
            NOTE: []
        };

        for (const obj of relatedObjects) {
            if (grouped[obj.type]) {
                grouped[obj.type].push(obj);
            }
        }

        return grouped;
    }
}
