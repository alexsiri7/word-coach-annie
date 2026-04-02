import { prisma } from "@/lib/db";
import { sanitizeInput } from "@/lib/sanitize-server";

export class UniversesController {
    static async listUniverses() {
        const universes = await prisma.universe.findMany({
            orderBy: { updatedAt: "desc" },
            include: {
                _count: {
                    select: { projects: true, worldObjects: true },
                },
            },
        });

        return universes.map((u: { id: string; title: string; description: string; createdAt: Date; updatedAt: Date; _count: { projects: number; worldObjects: number } }) => ({
            id: u.id,
            title: u.title,
            description: u.description,
            projectCount: u._count.projects,
            worldObjectCount: u._count.worldObjects,
            createdAt: u.createdAt.toISOString(),
            updatedAt: u.updatedAt.toISOString(),
        }));
    }

    static async getUniverse(id: string) {
        const universe = await prisma.universe.findUnique({
            where: { id },
            include: {
                projects: {
                    select: { id: true, title: true },
                },
                worldObjects: {
                    orderBy: { name: "asc" },
                },
            },
        });

        if (!universe) throw new Error(`Universe not found: ${id}`);

        return {
            id: universe.id,
            title: universe.title,
            description: universe.description,
            projects: universe.projects,
            worldObjects: universe.worldObjects.map((wo: { id: string; type: string; name: string; description: string; notes: string; tags: string; createdAt: Date; updatedAt: Date }) => ({
                ...wo,
                createdAt: wo.createdAt.toISOString(),
                updatedAt: wo.updatedAt.toISOString(),
            })),
            createdAt: universe.createdAt.toISOString(),
            updatedAt: universe.updatedAt.toISOString(),
        };
    }

    static async createUniverse(data: { title: string; description?: string }) {
        if (!data.title?.trim()) throw new Error("Title is required");

        const universe = await prisma.universe.create({
            data: {
                title: sanitizeInput(data.title.trim()),
                description: data.description ? sanitizeInput(data.description.trim()) : "",
            },
        });

        return {
            id: universe.id,
            title: universe.title,
            description: universe.description,
            createdAt: universe.createdAt.toISOString(),
            updatedAt: universe.updatedAt.toISOString(),
        };
    }

    static async updateUniverse(id: string, data: { title?: string; description?: string }) {
        const updateData: Record<string, string> = {};
        if (data.title !== undefined) updateData.title = sanitizeInput(data.title.trim());
        if (data.description !== undefined) updateData.description = sanitizeInput(data.description.trim());

        if (Object.keys(updateData).length === 0) throw new Error("No fields to update");

        const universe = await prisma.universe.update({
            where: { id },
            data: updateData,
        });

        return {
            id: universe.id,
            title: universe.title,
            description: universe.description,
            updatedAt: universe.updatedAt.toISOString(),
        };
    }

    static async deleteUniverse(id: string) {
        await prisma.universe.delete({ where: { id } });
    }

    static async listWorldObjects(universeId: string, type?: string) {
        const worldObjects = await prisma.worldObject.findMany({
            where: {
                universeId,
                ...(type && { type }),
            },
            orderBy: { name: "asc" },
        });

        return worldObjects.map((wo: { id: string; type: string; name: string; description: string; notes: string; tags: string; createdAt: Date; updatedAt: Date }) => ({
            ...wo,
            createdAt: wo.createdAt.toISOString(),
            updatedAt: wo.updatedAt.toISOString(),
        }));
    }

    static async getWorldObject(id: string) {
        const wo = await prisma.worldObject.findUnique({
            where: { id },
            include: {
                timeline: {
                    orderBy: { orderIndex: "asc" },
                },
                relationships: {
                    include: {
                        toNode: { select: { id: true, title: true, type: true } },
                        toObject: { select: { id: true, name: true, type: true } },
                        toWorldObject: { select: { id: true, name: true, type: true } },
                    },
                },
                relatedBy: {
                    include: {
                        fromNode: { select: { id: true, title: true, type: true } },
                        fromObject: { select: { id: true, name: true, type: true } },
                        fromWorldObject: { select: { id: true, name: true, type: true } },
                    },
                },
            },
        });

        if (!wo) throw new Error(`World Object not found: ${id}`);

        return {
            ...wo,
            createdAt: wo.createdAt.toISOString(),
            updatedAt: wo.updatedAt.toISOString(),
            timeline: wo.timeline.map((te: { id: string; label: string; orderIndex: number; description: string; attributes: string; projectId: string | null; createdAt: Date; updatedAt: Date }) => ({
                ...te,
                createdAt: te.createdAt.toISOString(),
                updatedAt: te.updatedAt.toISOString(),
            })),
        };
    }

    static async createWorldObject(data: {
        universeId: string;
        type: string;
        name: string;
        description?: string;
        notes?: string;
        tags?: string;
    }) {
        if (!data.name?.trim()) throw new Error("Name is required");
        if (!data.type?.trim()) throw new Error("Type is required");

        const wo = await prisma.worldObject.create({
            data: {
                universeId: data.universeId,
                type: data.type.trim(),
                name: sanitizeInput(data.name.trim()),
                description: data.description ? sanitizeInput(data.description.trim()) : "",
                notes: data.notes ? sanitizeInput(data.notes.trim()) : "",
                tags: data.tags ? sanitizeInput(data.tags.trim()) : "",
            },
        });

        return {
            ...wo,
            createdAt: wo.createdAt.toISOString(),
            updatedAt: wo.updatedAt.toISOString(),
        };
    }

    static async updateWorldObject(
        id: string,
        data: {
            name?: string;
            description?: string;
            notes?: string;
            tags?: string;
            type?: string;
        }
    ) {
        const updateData: Record<string, string> = {};
        if (data.name !== undefined) updateData.name = sanitizeInput(data.name.trim());
        if (data.description !== undefined) updateData.description = sanitizeInput(data.description.trim());
        if (data.notes !== undefined) updateData.notes = sanitizeInput(data.notes.trim());
        if (data.tags !== undefined) updateData.tags = sanitizeInput(data.tags.trim());
        if (data.type !== undefined) updateData.type = data.type.trim();

        if (Object.keys(updateData).length === 0) throw new Error("No fields to update");

        const wo = await prisma.worldObject.update({
            where: { id },
            data: updateData,
        });

        return {
            ...wo,
            createdAt: wo.createdAt.toISOString(),
            updatedAt: wo.updatedAt.toISOString(),
        };
    }

    static async deleteWorldObject(id: string) {
        await prisma.worldObject.delete({ where: { id } });
    }

    static async addTimelineEntry(data: {
        worldObjectId: string;
        label: string;
        description?: string;
        attributes?: string;
        projectId?: string;
        orderIndex?: number;
    }) {
        let orderIndex = data.orderIndex;

        if (orderIndex === undefined) {
            const lastEntry = await prisma.worldObjectTimelineEntry.findFirst({
                where: { worldObjectId: data.worldObjectId },
                orderBy: { orderIndex: "desc" },
            });
            orderIndex = (lastEntry?.orderIndex ?? -1) + 1;
        }

        const entry = await prisma.worldObjectTimelineEntry.create({
            data: {
                worldObjectId: data.worldObjectId,
                label: sanitizeInput(data.label.trim()),
                description: data.description ? sanitizeInput(data.description.trim()) : "",
                attributes: data.attributes?.trim() || "{}",
                projectId: data.projectId,
                orderIndex,
            },
        });

        return {
            ...entry,
            createdAt: entry.createdAt.toISOString(),
            updatedAt: entry.updatedAt.toISOString(),
        };
    }

    static async updateTimelineEntry(
        id: string,
        data: {
            label?: string;
            description?: string;
            attributes?: string;
            orderIndex?: number;
        }
    ) {
        const updateData: Record<string, string | number> = {};
        if (data.label !== undefined) updateData.label = data.label.trim();
        if (data.description !== undefined) updateData.description = data.description.trim();
        if (data.attributes !== undefined) updateData.attributes = data.attributes.trim();
        if (data.orderIndex !== undefined) updateData.orderIndex = data.orderIndex;

        if (Object.keys(updateData).length === 0) throw new Error("No fields to update");

        const entry = await prisma.worldObjectTimelineEntry.update({
            where: { id },
            data: updateData,
        });

        return {
            ...entry,
            createdAt: entry.createdAt.toISOString(),
            updatedAt: entry.updatedAt.toISOString(),
        };
    }

    static async deleteTimelineEntry(id: string) {
        await prisma.worldObjectTimelineEntry.delete({ where: { id } });
    }

    static async reorderTimelineEntries(worldObjectId: string, orderedIds: string[]) {
        await prisma.$transaction(
            orderedIds.map((id, index) =>
                prisma.worldObjectTimelineEntry.update({
                    where: { id },
                    data: { orderIndex: index },
                })
            )
        );
    }

    static async linkProjectToUniverse(projectId: string, universeId: string) {
        await prisma.project.update({
            where: { id: projectId },
            data: { universeId },
        });
    }

    static async unlinkProjectFromUniverse(projectId: string) {
        await prisma.project.update({
            where: { id: projectId },
            data: { universeId: null },
        });
    }

    static async copyWorldObjectToProject(worldObjectId: string, projectId: string) {
        return prisma.$transaction(async (tx) => {
            // 1. Fetch world object
            const wo = await tx.worldObject.findUnique({
                where: { id: worldObjectId },
                include: { relationships: true, relatedBy: true },
            });
            if (!wo) throw new Error(`World object not found: ${worldObjectId}`);

            // 2. Create StoryObject (copy — original stays in universe)
            const so = await tx.storyObject.create({
                data: {
                    projectId,
                    type: wo.type,
                    name: wo.name,
                    description: wo.description,
                    notes: wo.notes,
                    tags: wo.tags,
                },
            });

            // 3. Copy relationships: world object refs → story object refs
            for (const rel of wo.relationships) {
                await tx.relationship.create({
                    data: {
                        type: rel.type,
                        label: rel.label,
                        fromObjectId: so.id,
                        toNodeId: rel.toNodeId,
                        toObjectId: rel.toObjectId,
                        toWorldObjectId: rel.toWorldObjectId,
                    },
                });
            }
            for (const rel of wo.relatedBy) {
                await tx.relationship.create({
                    data: {
                        type: rel.type,
                        label: rel.label,
                        fromNodeId: rel.fromNodeId,
                        fromObjectId: rel.fromObjectId,
                        fromWorldObjectId: rel.fromWorldObjectId,
                        toObjectId: so.id,
                    },
                });
            }

            return {
                ...so,
                createdAt: so.createdAt.toISOString(),
                updatedAt: so.updatedAt.toISOString(),
            };
        });
    }

    static async transferStoryObjectToUniverse(storyObjectId: string, universeId: string) {
        return prisma.$transaction(async (tx) => {
            // 1. Fetch story object
            const obj = await tx.storyObject.findUnique({
                where: { id: storyObjectId },
            });
            if (!obj) throw new Error(`Story object not found: ${storyObjectId}`);

            // 2. Create WorldObject
            const wo = await tx.worldObject.create({
                data: {
                    universeId,
                    type: obj.type,
                    name: obj.name,
                    description: obj.description,
                    notes: obj.notes,
                    tags: obj.tags,
                },
            });

            // 3. Create Timeline Entry (linked to the project)
            await tx.worldObjectTimelineEntry.create({
                data: {
                    worldObjectId: wo.id,
                    label: "Initial State (Transferred)",
                    description: "Transferred from project story object.",
                    projectId: obj.projectId,
                    orderIndex: 0,
                },
            });

            // 4. Update Relationships
            // Replace story object with world object in relationships
            await tx.relationship.updateMany({
                where: { fromObjectId: storyObjectId },
                data: {
                    fromObjectId: null,
                    fromWorldObjectId: wo.id,
                },
            });

            await tx.relationship.updateMany({
                where: { toObjectId: storyObjectId },
                data: {
                    toObjectId: null,
                    toWorldObjectId: wo.id,
                },
            });

            // 5. Delete original StoryObject
            await tx.storyObject.delete({
                where: { id: storyObjectId },
            });

            return {
                ...wo,
                createdAt: wo.createdAt.toISOString(),
                updatedAt: wo.updatedAt.toISOString(),
            };
        });
    }
}
