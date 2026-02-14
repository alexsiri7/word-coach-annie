import { prisma } from "@/lib/db";

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

        return universes.map((u: any) => ({
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
            worldObjects: universe.worldObjects.map((wo: any) => ({
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
                title: data.title.trim(),
                description: data.description?.trim() || "",
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
        const updateData: any = {};
        if (data.title !== undefined) updateData.title = data.title.trim();
        if (data.description !== undefined) updateData.description = data.description.trim();

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

        return worldObjects.map((wo: any) => ({
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
            },
        });

        if (!wo) throw new Error(`World Object not found: ${id}`);

        return {
            ...wo,
            createdAt: wo.createdAt.toISOString(),
            updatedAt: wo.updatedAt.toISOString(),
            timeline: wo.timeline.map((te: any) => ({
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
                name: data.name.trim(),
                description: data.description?.trim() || "",
                notes: data.notes?.trim() || "",
                tags: data.tags?.trim() || "",
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
        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name.trim();
        if (data.description !== undefined) updateData.description = data.description.trim();
        if (data.notes !== undefined) updateData.notes = data.notes.trim();
        if (data.tags !== undefined) updateData.tags = data.tags.trim();
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
                label: data.label.trim(),
                description: data.description?.trim() || "",
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
        const updateData: any = {};
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
}
