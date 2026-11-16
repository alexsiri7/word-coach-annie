import {
    AccessDeniedError,
    assertProjectOwner,
    assertUniverseOwner,
    linkedUniverseId,
    projectIdForAnnotation,
    projectIdForContestSubmission,
    projectIdForLocationImage,
    projectIdForLocationSnapshot,
    projectIdForNode,
    projectIdForPublicationSubmission,
    projectIdForSnapshotAnnotation,
    projectIdForStoryObject,
    relationshipOwner,
    universeIdForTimelineEntry,
    universeIdForWorldObject,
    writingTaskOwner,
} from "@/lib/ownership";

/** An MCP caller, owner-checked; `userId` null is single-user mode, where every owner check passes. */
export interface OwnerPrincipal {
    userId: string | null;
}

/** A web-chat turn: every project-scoped resource must belong to `pinnedProjectId` (SEC-01). */
export interface ChatPrincipal {
    userId: string | null;
    pinnedProjectId: string;
    role: "OWNER" | "EDITOR" | null;
}

export type Principal = OwnerPrincipal | ChatPrincipal;

type ProjectScopedKind =
    | "node" | "storyObject" | "annotation" | "locationImage" | "locationSnapshot"
    | "snapshotAnnotation" | "contestSubmission" | "publicationSubmission";

export type ResourceKind =
    | "project" | ProjectScopedKind | "writingTask" | "relationship"
    | "universe" | "worldObject" | "timelineEntry"
    /** A universe the caller owns outright — for chat, the pinned project's linked universe does not count. */
    | "ownedUniverse";

export type ResourceRef =
    | { kind: ResourceKind; id: string }
    /** Batch tools: every id is resolved before any owner is checked. */
    | { kind: "node" | "storyObject"; ids: readonly string[] };

/**
 * Throws unless `principal` may touch every resource in `refs`. Refs are checked
 * one after another in order, so the first bad ref decides the error.
 */
export async function assertCanAccess(principal: Principal, refs: readonly ResourceRef[]): Promise<void> {
    for (const ref of refs) {
        if ("ids" in ref) {
            const projectIds = await Promise.all(ref.ids.map(id => projectIdFor(ref.kind, id)));
            await Promise.all([...new Set(projectIds)].map(pid => checkProject(principal, pid)));
        } else {
            await checkOne(principal, ref.kind, ref.id);
        }
    }
}

/** Chat only: an editor may not run owner-only tools. MCP has no roles. */
export function assertOwnerRole(principal: Principal): void {
    if (isChat(principal) && principal.userId && principal.role !== "OWNER") {
        throw new Error("Forbidden: only the project owner may do this");
    }
}

function isChat(principal: Principal): principal is ChatPrincipal {
    return "pinnedProjectId" in principal;
}

function forbidden(what: string): Error {
    return new Error(`Forbidden: ${what} is outside the current project`);
}

async function checkOne(principal: Principal, kind: ResourceKind, id: string): Promise<void> {
    switch (kind) {
        case "project":
            return checkProject(principal, id);
        case "universe":
            return checkUniverse(principal, id);
        case "ownedUniverse":
            return assertUniverseOwner(id, principal.userId);
        case "worldObject":
            return checkUniverse(principal, await universeIdForWorldObject(id));
        case "timelineEntry":
            return checkUniverse(principal, await universeIdForTimelineEntry(id));
        case "relationship": {
            const owner = await relationshipOwner(id);
            if (owner.projectId) return checkProject(principal, owner.projectId);
            if (owner.universeId) return checkUniverse(principal, owner.universeId);
            return;
        }
        case "writingTask": {
            const task = await writingTaskOwner(id);
            if (task.projectId) return checkProject(principal, task.projectId);
            if (isChat(principal)) throw forbidden("writing task");
            if (principal.userId && task.userId !== principal.userId) throw new AccessDeniedError("Writing task");
            return;
        }
        default:
            return checkProject(principal, await projectIdFor(kind, id));
    }
}

function projectIdFor(kind: ProjectScopedKind, id: string): Promise<string> {
    switch (kind) {
        case "node": return projectIdForNode(id);
        case "storyObject": return projectIdForStoryObject(id);
        case "annotation": return projectIdForAnnotation(id);
        case "locationImage": return projectIdForLocationImage(id);
        case "locationSnapshot": return projectIdForLocationSnapshot(id);
        case "snapshotAnnotation": return projectIdForSnapshotAnnotation(id);
        case "contestSubmission": return projectIdForContestSubmission(id);
        case "publicationSubmission": return projectIdForPublicationSubmission(id);
    }
}

async function checkProject(principal: Principal, projectId: string): Promise<void> {
    if (!isChat(principal)) return assertProjectOwner(projectId, principal.userId);
    if (projectId !== principal.pinnedProjectId) throw forbidden("project");
}

async function checkUniverse(principal: Principal, universeId: string): Promise<void> {
    if (isChat(principal) && (await linkedUniverseId(principal.pinnedProjectId)) === universeId) return;
    return assertUniverseOwner(universeId, principal.userId);
}
