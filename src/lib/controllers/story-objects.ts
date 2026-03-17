import { prisma } from "@/lib/db";
import { autoSnapshot } from "../../mcp/snapshot";

const VALID_TYPES = ["CHARACTER", "LOCATION", "PLOTLINE", "WORLD_ELEMENT", "NOTE"] as const;
type StoryObjectType = (typeof VALID_TYPES)[number];

export class StoryObjectController {
    static async listStoryObjects(params: {
        projectId: string;
        type?: string;
        search?: string;
        limit?: number;
        offset?: number;
    }) {
        const { projectId, type, search, limit = 50, offset = 0 } = params;

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true, universeId: true },
        });
        if (!project) throw new Error(`Project not found: ${projectId}`);

        if (type && !VALID_TYPES.includes(type as StoryObjectType)) {
            throw new Error(`Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`);
        }

        const where: Record<string, unknown> = { projectId };
        if (type) where.type = type;
        if (search) where.name = { contains: search };

        // WorldObject types that overlap with StoryObject types
        const WORLD_OBJECT_TYPES = ["CHARACTER", "LOCATION", "WORLD_ELEMENT"];

        // Fetch project story objects and universe world objects in parallel
        const shouldFetchWorldObjects = project.universeId &&
            (!type || WORLD_OBJECT_TYPES.includes(type));

        const worldObjectWhere: Record<string, unknown> = project.universeId
            ? { universeId: project.universeId }
            : {};
        if (type) worldObjectWhere.type = type;
        if (search) worldObjectWhere.name = { contains: search };

        const [storyObjects, storyTotal, worldObjects] = await Promise.all([
            prisma.storyObject.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: Math.min(limit, 200),
                skip: offset,
            }),
            prisma.storyObject.count({ where }),
            shouldFetchWorldObjects
                ? prisma.worldObject.findMany({
                    where: worldObjectWhere,
                    orderBy: { createdAt: "desc" },
                })
                : Promise.resolve([]),
        ]);

        const projectObjects = storyObjects.map((obj) => ({
            id: obj.id,
            type: obj.type,
            name: obj.name,
            description: obj.description,
            notes: obj.notes,
            role: obj.role,
            tags: obj.tags,
            source: "project" as const,
            createdAt: obj.createdAt.toISOString(),
            updatedAt: obj.updatedAt.toISOString(),
        }));

        const universeObjects = worldObjects.map((obj) => ({
            id: obj.id,
            type: obj.type,
            name: obj.name,
            description: obj.description,
            notes: obj.notes,
            role: null,
            tags: obj.tags,
            source: "universe" as const,
            createdAt: obj.createdAt.toISOString(),
            updatedAt: obj.updatedAt.toISOString(),
        }));

        return {
            objects: [...projectObjects, ...universeObjects],
            total: storyTotal + worldObjects.length,
        };
    }

    static async getStoryObject(objectId: string) {
        const obj = await prisma.storyObject.findUnique({
            where: { id: objectId },
            include: {
                relationships: {
                    include: {
                        toNode: { select: { id: true, title: true, type: true } },
                        toObject: { select: { id: true, name: true, type: true } },
                    },
                },
                relatedBy: {
                    include: {
                        fromNode: { select: { id: true, title: true, type: true } },
                        fromObject: { select: { id: true, name: true, type: true } },
                    },
                },
            },
        });

        if (!obj) throw new Error(`Story object not found: ${objectId}`);

        const relatedTo = [
            ...obj.relationships.map((r) => ({
                relationshipId: r.id,
                type: r.type,
                label: r.label,
                target: r.toNode
                    ? { id: r.toNode.id, name: r.toNode.title, entityType: r.toNode.type }
                    : r.toObject
                        ? { id: r.toObject.id, name: r.toObject.name, entityType: r.toObject.type }
                        : null,
            })),
            ...obj.relatedBy.map((r) => ({
                relationshipId: r.id,
                type: r.type,
                label: r.label,
                target: r.fromNode
                    ? { id: r.fromNode.id, name: r.fromNode.title, entityType: r.fromNode.type }
                    : r.fromObject
                        ? { id: r.fromObject.id, name: r.fromObject.name, entityType: r.fromObject.type }
                        : null,
            })),
        ];

        return {
            id: obj.id,
            type: obj.type,
            name: obj.name,
            description: obj.description,
            notes: obj.notes,
            role: obj.role,
            tags: obj.tags,
            relationships: relatedTo,
            createdAt: obj.createdAt.toISOString(),
            updatedAt: obj.updatedAt.toISOString(),
        };
    }

    static async createStoryObject(params: {
        projectId: string;
        type: string;
        name: string;
        description?: string;
        notes?: string;
        role?: string;
        tags?: string;
    }) {
        const { projectId, type, name, description, notes, role, tags } = params;

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true },
        });
        if (!project) throw new Error(`Project not found: ${projectId}`);

        if (!VALID_TYPES.includes(type as StoryObjectType)) {
            throw new Error(`Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`);
        }

        if (!name || name.trim().length === 0) {
            throw new Error("name is required");
        }

        const obj = await prisma.storyObject.create({
            data: {
                projectId,
                type,
                name: name.trim(),
                ...(description !== undefined && { description }),
                ...(notes !== undefined && { notes }),
                ...(role !== undefined && { role }),
                ...(tags !== undefined && { tags }),
            },
        });

        return {
            id: obj.id,
            type: obj.type,
            name: obj.name,
            description: obj.description,
            notes: obj.notes,
            role: obj.role,
            tags: obj.tags,
            createdAt: obj.createdAt.toISOString(),
        };
    }

    static async updateStoryObject(
        objectId: string,
        data: {
            name?: string;
            description?: string;
            notes?: string;
            role?: string | null;
            tags?: string;
        }
    ) {
        const existing = await prisma.storyObject.findUnique({
            where: { id: objectId },
            select: { id: true },
        });
        if (!existing) throw new Error(`Story object not found: ${objectId}`);

        if (data.name !== undefined && data.name.trim().length === 0) {
            throw new Error("name must be a non-empty string");
        }

        const updateData: Record<string, unknown> = {};
        if (data.name !== undefined) updateData.name = data.name.trim();
        if (data.description !== undefined) updateData.description = data.description;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.role !== undefined) updateData.role = data.role;
        if (data.tags !== undefined) updateData.tags = data.tags;

        if (Object.keys(updateData).length === 0) {
            throw new Error("No fields to update");
        }

        const obj = await prisma.storyObject.update({
            where: { id: objectId },
            data: updateData,
        });

        return {
            id: obj.id,
            type: obj.type,
            name: obj.name,
            description: obj.description,
            notes: obj.notes,
            role: obj.role,
            tags: obj.tags,
            updatedAt: obj.updatedAt.toISOString(),
        };
    }

    static async deleteStoryObject(objectId: string) {
        const obj = await prisma.storyObject.findUnique({ where: { id: objectId } });
        if (!obj) throw new Error(`Story object not found: ${objectId}`);

        try {
            autoSnapshot("delete_story_object", obj.name);
        } catch (e) {
            // ignore snapshot issues in pure execution context if necessary
        }

        await prisma.storyObject.delete({ where: { id: objectId } });

        return { deleted: true, id: objectId, name: obj.name, type: obj.type };
    }

    static async batchCreateStoryObjects(
        projectId: string,
        objects: Array<{
            type: string;
            name: string;
            description?: string;
            notes?: string;
            role?: string;
            tags?: string;
        }>
    ) {
        if (objects.length === 0) throw new Error("objects array must not be empty");
        if (objects.length > 50) throw new Error("Maximum 50 objects per batch");

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true },
        });
        if (!project) throw new Error(`Project not found: ${projectId}`);

        const results = [];
        const errors = [];

        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];
            try {
                if (!VALID_TYPES.includes(obj.type as StoryObjectType)) {
                    throw new Error(`Invalid type "${obj.type}". Must be one of: ${VALID_TYPES.join(", ")}`);
                }
                if (!obj.name || obj.name.trim().length === 0) {
                    throw new Error("name is required");
                }

                const created = await prisma.storyObject.create({
                    data: {
                        projectId,
                        type: obj.type,
                        name: obj.name.trim(),
                        ...(obj.description !== undefined && { description: obj.description }),
                        ...(obj.notes !== undefined && { notes: obj.notes }),
                        ...(obj.role !== undefined && { role: obj.role }),
                        ...(obj.tags !== undefined && { tags: obj.tags }),
                    },
                });

                results.push({
                    index: i,
                    success: true,
                    id: created.id,
                    type: created.type,
                    name: created.name,
                });
            } catch (e) {
                errors.push({
                    index: i,
                    success: false,
                    name: obj.name,
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }

        return { created: results, errors, totalCreated: results.length, totalErrors: errors.length };
    }

    static async batchUpdateStoryObjects(
        updates: Array<{
            objectId: string;
            name?: string;
            description?: string;
            notes?: string;
            role?: string | null;
            tags?: string;
        }>
    ) {
        if (updates.length === 0) throw new Error("updates array must not be empty");
        if (updates.length > 50) throw new Error("Maximum 50 updates per batch");

        const results = [];
        const errors = [];

        for (let i = 0; i < updates.length; i++) {
            const { objectId, ...data } = updates[i];
            try {
                const result = await StoryObjectController.updateStoryObject(objectId, data);
                results.push({ index: i, success: true, id: result.id, name: result.name });
            } catch (e) {
                errors.push({
                    index: i,
                    success: false,
                    objectId,
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }

        return { updated: results, errors, totalUpdated: results.length, totalErrors: errors.length };
    }

    static async batchDeleteStoryObjects(objectIds: string[]) {
        if (objectIds.length === 0) throw new Error("objectIds array must not be empty");
        if (objectIds.length > 50) throw new Error("Maximum 50 deletions per batch");

        try {
            autoSnapshot("batch_delete_story_objects", `${objectIds.length} objects`);
        } catch (e) {
            // ignore snapshot issues
        }

        const results = [];
        const errors = [];

        for (let i = 0; i < objectIds.length; i++) {
            const objectId = objectIds[i];
            try {
                const obj = await prisma.storyObject.findUnique({ where: { id: objectId } });
                if (!obj) throw new Error(`Story object not found: ${objectId}`);
                await prisma.storyObject.delete({ where: { id: objectId } });
                results.push({ index: i, success: true, id: objectId, name: obj.name });
            } catch (e) {
                errors.push({
                    index: i,
                    success: false,
                    objectId,
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }

        return { deleted: results, errors, totalDeleted: results.length, totalErrors: errors.length };
    }
}
