import { prisma } from "@/lib/db";
import { autoSnapshot } from "../snapshot";
import { mcpCache } from "@/lib/cache";

type RelationshipEntity = { id: string; name: string; entityType: string } | null;

function resolveEntity(
    node: { id: string; title: string; type: string } | null | undefined,
    obj: { id: string; name: string; type: string } | null | undefined,
    worldObj: { id: string; name: string; type: string } | null | undefined,
): RelationshipEntity {
    if (node) return { id: node.id, name: node.title, entityType: node.type };
    if (obj) return { id: obj.id, name: obj.name, entityType: obj.type };
    if (worldObj) return { id: worldObj.id, name: worldObj.name, entityType: worldObj.type };
    return null;
}

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
    return mcpCache.getOrSet(
        `relationships:${projectId}`,
        async () => {
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

            const nodeIds = nodes.map((n: { id: string }) => n.id);
            const objectIds = objects.map((o: { id: string }) => o.id);

            const relationships = await prisma.relationship.findMany({
                where: {
                    OR: [
                        { fromNodeId: { in: nodeIds } },
                        { fromObjectId: { in: objectIds } },
                        { toNodeId: { in: nodeIds } },
                        { toObjectId: { in: objectIds } },
                        { fromWorldObjectId: { not: null } },
                        { toWorldObjectId: { not: null } },
                    ],
                },
                include: {
                    fromNode: { select: { id: true, title: true, type: true } },
                    fromObject: { select: { id: true, name: true, type: true } },
                    fromWorldObject: { select: { id: true, name: true, type: true } },
                    toNode: { select: { id: true, title: true, type: true } },
                    toObject: { select: { id: true, name: true, type: true } },
                    toWorldObject: { select: { id: true, name: true, type: true } },
                },
                orderBy: { createdAt: "desc" },
            });

            return {
                relationships: relationships.map((r) => ({
                    id: r.id,
                    type: r.type,
                    label: r.label,
                    from: resolveEntity(r.fromNode, r.fromObject, r.fromWorldObject),
                    to: resolveEntity(r.toNode, r.toObject, r.toWorldObject),
                })),
                total: relationships.length,
            };
        },
    );
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
        select: { id: true, universeId: true },
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

    const fromFields = [fromNodeId, fromObjectId].filter(Boolean);
    if (fromFields.length !== 1) {
        throw new Error("Exactly one from-field must be provided (fromNodeId or fromObjectId)");
    }

    const toFields = [toNodeId, toObjectId].filter(Boolean);
    if (toFields.length !== 1) {
        throw new Error("Exactly one to-field must be provided (toNodeId or toObjectId)");
    }

    const universeId = project.universeId;

    if (fromNodeId) {
        const node = await prisma.structureNode.findFirst({ where: { id: fromNodeId, projectId } });
        if (!node) throw new Error("fromNodeId not found in this project");
    }
    async function resolveObjectId(objectId: string, fieldName: string): Promise<{ objectId?: string; worldObjectId?: string }> {
        const storyObj = await prisma.storyObject.findFirst({ where: { id: objectId, projectId } });
        if (storyObj) return { objectId };
        if (universeId) {
            const worldObj = await prisma.worldObject.findFirst({ where: { id: objectId, universeId } });
            if (!worldObj) throw new Error(`${fieldName} not found in this project or linked universe`);
            return { worldObjectId: objectId };
        }
        throw new Error(`${fieldName} not found in this project`);
    }

    const { objectId: resolvedFromObjectId, worldObjectId: resolvedFromWorldObjectId } =
        fromObjectId ? await resolveObjectId(fromObjectId, "fromObjectId") : {};
    if (toNodeId) {
        const node = await prisma.structureNode.findFirst({ where: { id: toNodeId, projectId } });
        if (!node) throw new Error("toNodeId not found in this project");
    }
    const { objectId: resolvedToObjectId, worldObjectId: resolvedToWorldObjectId } =
        toObjectId ? await resolveObjectId(toObjectId, "toObjectId") : {};

    const relationship = await prisma.relationship.create({
        data: {
            type,
            ...(label !== undefined && { label }),
            ...(fromNodeId && { fromNodeId }),
            ...(resolvedFromObjectId && { fromObjectId: resolvedFromObjectId }),
            ...(resolvedFromWorldObjectId && { fromWorldObjectId: resolvedFromWorldObjectId }),
            ...(toNodeId && { toNodeId }),
            ...(resolvedToObjectId && { toObjectId: resolvedToObjectId }),
            ...(resolvedToWorldObjectId && { toWorldObjectId: resolvedToWorldObjectId }),
        },
        include: {
            fromNode: { select: { id: true, title: true, type: true } },
            fromObject: { select: { id: true, name: true, type: true } },
            fromWorldObject: { select: { id: true, name: true, type: true } },
            toNode: { select: { id: true, title: true, type: true } },
            toObject: { select: { id: true, name: true, type: true } },
            toWorldObject: { select: { id: true, name: true, type: true } },
        },
    });

    mcpCache.delete(`relationships:${projectId}`);
    mcpCache.delete(`projectSummary:${projectId}`);

    return {
        id: relationship.id,
        type: relationship.type,
        label: relationship.label,
        from: resolveEntity(relationship.fromNode, relationship.fromObject, relationship.fromWorldObject),
        to: resolveEntity(relationship.toNode, relationship.toObject, relationship.toWorldObject),
    };
}

export async function deleteRelationship(relationshipId: string) {
    const existing = await prisma.relationship.findUnique({
        where: { id: relationshipId },
        include: {
            fromNode: { select: { title: true } },
            fromObject: { select: { name: true } },
            fromWorldObject: { select: { name: true } },
            toNode: { select: { title: true } },
            toObject: { select: { name: true } },
            toWorldObject: { select: { name: true } },
        },
    });
    if (!existing) throw new Error(`Relationship not found: ${relationshipId}`);

    const fromName = existing.fromNode?.title || existing.fromObject?.name || existing.fromWorldObject?.name || "?";
    const toName = existing.toNode?.title || existing.toObject?.name || existing.toWorldObject?.name || "?";

    autoSnapshot("delete_relationship", `${fromName} → ${toName}`);

    await prisma.relationship.delete({ where: { id: relationshipId } });

    mcpCache.invalidatePrefix("relationships:");
    mcpCache.invalidatePrefix("projectSummary:");

    return {
        deleted: true,
        id: relationshipId,
        description: `${fromName} ${existing.type} ${toName}`,
    };
}
