import { prisma } from "@/lib/db";
import { UserFacingError } from "@/lib/controllers/errors";

export class AccessDeniedError extends UserFacingError {
    constructor(what = "Resource") {
        super(`${what} not found or access denied`);
        this.name = "AccessDeniedError";
    }
}

/** Owner-only project check. No-op in single-user mode (uid === null), matching REST semantics. */
export async function assertProjectOwner(projectId: string, uid: string | null): Promise<void> {
    if (!uid) return;
    const row = await prisma.project.findFirst({ where: { id: projectId, userId: uid }, select: { id: true } });
    if (!row) throw new AccessDeniedError("Project");
}

/** Owner-only universe check. Unowned universes (userId NULL) are denied to authenticated users. */
export async function assertUniverseOwner(universeId: string, uid: string | null): Promise<void> {
    if (!uid) return;
    const row = await prisma.universe.findFirst({ where: { id: universeId, userId: uid }, select: { id: true } });
    if (!row) throw new AccessDeniedError("Universe");
}

export async function projectIdForNode(nodeId: string): Promise<string> {
    const n = await prisma.structureNode.findUnique({ where: { id: nodeId }, select: { projectId: true } });
    if (!n) throw new AccessDeniedError("Node");
    return n.projectId;
}

export async function projectIdForStoryObject(objectId: string): Promise<string> {
    const o = await prisma.storyObject.findUnique({ where: { id: objectId }, select: { projectId: true } });
    if (!o) throw new AccessDeniedError("Story object");
    return o.projectId;
}

export async function projectIdForAnnotation(annotationId: string): Promise<string> {
    const a = await prisma.annotation.findUnique({
        where: { id: annotationId },
        select: { node: { select: { projectId: true } } },
    });
    if (!a) throw new AccessDeniedError("Annotation");
    return a.node.projectId;
}

export async function universeIdForWorldObject(objectId: string): Promise<string> {
    const w = await prisma.worldObject.findUnique({ where: { id: objectId }, select: { universeId: true } });
    if (!w) throw new AccessDeniedError("World object");
    return w.universeId;
}

export async function universeIdForTimelineEntry(entryId: string): Promise<string> {
    const e = await prisma.worldObjectTimelineEntry.findUnique({
        where: { id: entryId },
        select: { worldObject: { select: { universeId: true } } },
    });
    if (!e) throw new AccessDeniedError("Timeline entry");
    return e.worldObject.universeId;
}

/** Mirrors verifyRelationshipAccess in src/app/api/relationships/[id]/route.ts. */
export async function relationshipOwner(relationshipId: string): Promise<{ projectId?: string; universeId?: string }> {
    const rel = await prisma.relationship.findUnique({
        where: { id: relationshipId },
        select: {
            fromNode: { select: { projectId: true } },
            toNode: { select: { projectId: true } },
            fromObject: { select: { projectId: true } },
            toObject: { select: { projectId: true } },
            fromWorldObject: { select: { universeId: true } },
            toWorldObject: { select: { universeId: true } },
        },
    });
    if (!rel) throw new AccessDeniedError("Relationship");
    const projectId = rel.fromNode?.projectId ?? rel.toNode?.projectId ?? rel.fromObject?.projectId ?? rel.toObject?.projectId;
    if (projectId) return { projectId };
    const universeId = rel.fromWorldObject?.universeId ?? rel.toWorldObject?.universeId;
    if (universeId) return { universeId };
    throw new AccessDeniedError("Relationship"); // orphaned — deny by default
}

export async function assertRelationshipOwner(relationshipId: string, uid: string | null): Promise<void> {
    const owner = await relationshipOwner(relationshipId);
    if (owner.projectId) return assertProjectOwner(owner.projectId, uid);
    if (owner.universeId) return assertUniverseOwner(owner.universeId, uid);
}
