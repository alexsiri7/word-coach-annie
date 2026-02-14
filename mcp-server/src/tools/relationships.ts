import { prisma } from "../db.js";
import { autoSnapshot } from "../snapshot.js";

const VALID_RELATIONSHIP_TYPES = [
    "APPEARS_IN",
    "LOCATED_AT",
    "PART_OF_PLOTLINE",
    "RELATED_TO",
    "INTERACTS_WITH",
    "CONTAINS",
    "PRECEDES",
    "FOLLOWS",
] as const;

export async function listRelationships(projectId: string) {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
    });
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const [nodes, objects] = await Promise.all([
        prisma.structureNode.findMany({
            where: { projectId },
            select: { id: true },
        }),
        prisma.storyObject.findMany({
            where: { projectId },
            select: { id: true },
        }),
    ]);

    const nodeIds = nodes.map((n) => n.id);
    const objectIds = objects.map((o) => o.id);

    const relationships = await prisma.relationship.findMany({
        where: {
            OR: [
                { fromNodeId: { in: nodeIds } },
                { fromObjectId: { in: objectIds } },
                { toNodeId: { in: nodeIds } },
                { toObjectId: { in: objectIds } },
            ],
        },
        include: {
            fromNode: { select: { id: true, title: true, type: true } },
            fromObject: { select: { id: true, name: true, type: true } },
            toNode: { select: { id: true, title: true, type: true } },
            toObject: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
    });

    return {
        relationships: relationships.map((r) => ({
            id: r.id,
            type: r.type,
            label: r.label,
            from: r.fromNode
                ? { id: r.fromNode.id, name: r.fromNode.title, entityType: r.fromNode.type }
                : r.fromObject
                    ? { id: r.fromObject.id, name: r.fromObject.name, entityType: r.fromObject.type }
                    : null,
            to: r.toNode
                ? { id: r.toNode.id, name: r.toNode.title, entityType: r.toNode.type }
                : r.toObject
                    ? { id: r.toObject.id, name: r.toObject.name, entityType: r.toObject.type }
                    : null,
        })),
        total: relationships.length,
    };
}

export async function createRelationship(params: {
    projectId: string;
    type: string;
    fromNodeId?: string;
    fromObjectId?: string;
    toNodeId?: string;
    toObjectId?: string;
    label?: string;
}) {
    const { projectId, type, fromNodeId, fromObjectId, toNodeId, toObjectId, label } = params;

    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
    });
    if (!project) throw new Error(`Project not found: ${projectId}`);

    if (
        !VALID_RELATIONSHIP_TYPES.includes(
            type as (typeof VALID_RELATIONSHIP_TYPES)[number]
        )
    ) {
        throw new Error(
            `Invalid type. Must be one of: ${VALID_RELATIONSHIP_TYPES.join(", ")}`
        );
    }

    // Validate exactly one from-field
    const fromFields = [fromNodeId, fromObjectId].filter(Boolean);
    if (fromFields.length !== 1) {
        throw new Error("Exactly one from-field must be provided (fromNodeId or fromObjectId)");
    }

    // Validate exactly one to-field
    const toFields = [toNodeId, toObjectId].filter(Boolean);
    if (toFields.length !== 1) {
        throw new Error("Exactly one to-field must be provided (toNodeId or toObjectId)");
    }

    // Verify entities exist in this project
    if (fromNodeId) {
        const node = await prisma.structureNode.findFirst({
            where: { id: fromNodeId, projectId },
        });
        if (!node) throw new Error("fromNodeId not found in this project");
    }
    if (fromObjectId) {
        const obj = await prisma.storyObject.findFirst({
            where: { id: fromObjectId, projectId },
        });
        if (!obj) throw new Error("fromObjectId not found in this project");
    }
    if (toNodeId) {
        const node = await prisma.structureNode.findFirst({
            where: { id: toNodeId, projectId },
        });
        if (!node) throw new Error("toNodeId not found in this project");
    }
    if (toObjectId) {
        const obj = await prisma.storyObject.findFirst({
            where: { id: toObjectId, projectId },
        });
        if (!obj) throw new Error("toObjectId not found in this project");
    }

    const relationship = await prisma.relationship.create({
        data: {
            type,
            ...(label !== undefined && { label }),
            ...(fromNodeId && { fromNodeId }),
            ...(fromObjectId && { fromObjectId }),
            ...(toNodeId && { toNodeId }),
            ...(toObjectId && { toObjectId }),
        },
        include: {
            fromNode: { select: { id: true, title: true, type: true } },
            fromObject: { select: { id: true, name: true, type: true } },
            toNode: { select: { id: true, title: true, type: true } },
            toObject: { select: { id: true, name: true, type: true } },
        },
    });

    return {
        id: relationship.id,
        type: relationship.type,
        label: relationship.label,
        from: relationship.fromNode
            ? { id: relationship.fromNode.id, name: relationship.fromNode.title, entityType: relationship.fromNode.type }
            : relationship.fromObject
                ? { id: relationship.fromObject.id, name: relationship.fromObject.name, entityType: relationship.fromObject.type }
                : null,
        to: relationship.toNode
            ? { id: relationship.toNode.id, name: relationship.toNode.title, entityType: relationship.toNode.type }
            : relationship.toObject
                ? { id: relationship.toObject.id, name: relationship.toObject.name, entityType: relationship.toObject.type }
                : null,
    };
}

export async function deleteRelationship(relationshipId: string) {
    const existing = await prisma.relationship.findUnique({
        where: { id: relationshipId },
        include: {
            fromNode: { select: { title: true } },
            fromObject: { select: { name: true } },
            toNode: { select: { title: true } },
            toObject: { select: { name: true } },
        },
    });
    if (!existing) throw new Error(`Relationship not found: ${relationshipId}`);

    const fromName = existing.fromNode?.title || existing.fromObject?.name || "?";
    const toName = existing.toNode?.title || existing.toObject?.name || "?";

    // Auto-snapshot before deletion
    autoSnapshot("delete_relationship", `${fromName} → ${toName}`);

    await prisma.relationship.delete({ where: { id: relationshipId } });

    return {
        deleted: true,
        id: relationshipId,
        description: `${fromName} ${existing.type} ${toName}`,
    };
}
