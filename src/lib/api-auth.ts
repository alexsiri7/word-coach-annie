import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/db";

/**
 * Get the authenticated user's ID from the request.
 * Returns the userId from the x-user-id header (set by middleware for JWT sessions),
 * or null for API_TOKEN / unauthenticated (local dev) sessions.
 * Also sets Sentry user context for error attribution on server-side routes.
 */
export function getCurrentUserId(request: NextRequest): string | null {
    const userId = request.headers.get("x-user-id");
    const email = request.headers.get("x-user-email");
    if (userId) {
        Sentry.setUser({ id: userId, email: email ?? undefined });
    }
    return userId;
}

/**
 * Verify that a project belongs to the current user (owner-only).
 * Returns the project and role if accessible, or a 403/404 response.
 * When userId is null (API_TOKEN/dev mode), all projects are accessible (role = null).
 * Unowned projects (NULL userId) are denied to authenticated users.
 */
export async function verifyProjectAccess(
    projectId: string,
    userId: string | null
): Promise<
    | { authorized: true; project: { id: string; userId: string | null }; role: "OWNER" | null }
    | { authorized: false; response: NextResponse }
> {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, userId: true },
    });

    if (!project) {
        return {
            authorized: false,
            response: NextResponse.json({ error: "Project not found" }, { status: 404 }),
        };
    }

    // No user scoping in API_TOKEN / dev mode
    if (!userId) {
        return { authorized: true, project, role: null };
    }

    if (project.userId !== userId) {
        return {
            authorized: false,
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
    }

    return { authorized: true, project, role: "OWNER" };
}

/**
 * Verify that the current user has read access to a project.
 * Allows both owners and readers (via ProjectShare).
 * When userId is null (API_TOKEN/dev mode), all projects are accessible (role = null).
 */
export async function verifyProjectReadAccess(
    projectId: string,
    userId: string | null,
    userEmail?: string | null
): Promise<
    | { authorized: true; project: { id: string; userId: string | null }; role: "OWNER" | "READER" | "EDITOR" | null }
    | { authorized: false; response: NextResponse }
> {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, userId: true },
    });

    if (!project) {
        return {
            authorized: false,
            response: NextResponse.json({ error: "Project not found" }, { status: 404 }),
        };
    }

    // No user scoping in API_TOKEN / dev mode
    if (!userId) {
        return { authorized: true, project, role: null };
    }

    // Owner check
    if (project.userId === userId) {
        return { authorized: true, project, role: "OWNER" };
    }

    // Reader check via ProjectShare
    if (userEmail) {
        const share = await prisma.projectShare.findUnique({
            where: {
                projectId_email: {
                    projectId,
                    email: userEmail.toLowerCase(),
                },
            },
        });
        if (share) {
            const shareRole = share.role === "EDITOR" ? "EDITOR" : "READER";
            return { authorized: true, project, role: shareRole as "READER" | "EDITOR" };
        }
    }

    return {
        authorized: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
}

/**
 * Verify that a universe belongs to the current user.
 * Returns the universe if accessible, or a 403/404 response.
 * When userId is null (API_TOKEN/dev mode), all universes are accessible.
 * Unowned universes (NULL userId) are denied to authenticated users.
 */
export async function verifyUniverseAccess(
    universeId: string,
    userId: string | null
): Promise<{ authorized: true; universe: { id: string; userId: string | null } } | { authorized: false; response: NextResponse }> {
    const universe = await prisma.universe.findUnique({
        where: { id: universeId },
        select: { id: true, userId: true },
    });

    if (!universe) {
        return {
            authorized: false,
            response: NextResponse.json({ error: "Universe not found" }, { status: 404 }),
        };
    }

    if (!userId) {
        return { authorized: true, universe };
    }

    if (universe.userId !== userId) {
        return {
            authorized: false,
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
    }

    return { authorized: true, universe };
}

/**
 * Verify that the current user has write access to a project.
 * Allows owners and editors (via ProjectShare with role EDITOR).
 * When userId is null (API_TOKEN/dev mode), all projects are accessible (role = null).
 */
export async function verifyProjectWriteAccess(
    projectId: string,
    userId: string | null,
    userEmail?: string | null
): Promise<
    | { authorized: true; project: { id: string; userId: string | null }; role: "OWNER" | "EDITOR" | null }
    | { authorized: false; response: NextResponse }
> {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, userId: true },
    });

    if (!project) {
        return {
            authorized: false,
            response: NextResponse.json({ error: "Project not found" }, { status: 404 }),
        };
    }

    if (!userId) {
        return { authorized: true, project, role: null };
    }

    if (project.userId === userId) {
        return { authorized: true, project, role: "OWNER" };
    }

    if (userEmail) {
        const share = await prisma.projectShare.findUnique({
            where: {
                projectId_email: {
                    projectId,
                    email: userEmail.toLowerCase(),
                },
            },
        });
        if (share && share.role === "EDITOR") {
            return { authorized: true, project, role: "EDITOR" };
        }
    }

    return {
        authorized: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
}

/**
 * Verify access to a resource via its parent project.
 * Looks up the resource's projectId, then checks project ownership.
 */
export async function verifyProjectAccessByNode(
    nodeId: string,
    userId: string | null
): Promise<{ authorized: true; projectId: string } | { authorized: false; response: NextResponse }> {
    const node = await prisma.structureNode.findUnique({
        where: { id: nodeId },
        select: { projectId: true },
    });

    if (!node) {
        return {
            authorized: false,
            response: NextResponse.json({ error: "Node not found" }, { status: 404 }),
        };
    }

    const access = await verifyProjectAccess(node.projectId, userId);
    if (!access.authorized) return access;
    return { authorized: true, projectId: node.projectId };
}

/**
 * Verify read access to a resource via its parent project.
 * Allows owners, editors, and readers (via ProjectShare).
 */
export async function verifyProjectReadAccessByNode(
    nodeId: string,
    userId: string | null,
    userEmail?: string | null
): Promise<{ authorized: true; projectId: string; role: "OWNER" | "READER" | "EDITOR" | null } | { authorized: false; response: NextResponse }> {
    const node = await prisma.structureNode.findUnique({
        where: { id: nodeId },
        select: { projectId: true },
    });

    if (!node) {
        return {
            authorized: false,
            response: NextResponse.json({ error: "Node not found" }, { status: 404 }),
        };
    }

    const access = await verifyProjectReadAccess(node.projectId, userId, userEmail);
    if (!access.authorized) return access;
    return { authorized: true, projectId: node.projectId, role: access.role };
}

/**
 * Verify write access to a resource via its parent project.
 * Allows owners and editors (via ProjectShare with role EDITOR).
 */
export async function verifyProjectWriteAccessByNode(
    nodeId: string,
    userId: string | null,
    userEmail?: string | null
): Promise<{ authorized: true; projectId: string; role: "OWNER" | "EDITOR" | null } | { authorized: false; response: NextResponse }> {
    const node = await prisma.structureNode.findUnique({
        where: { id: nodeId },
        select: { projectId: true },
    });

    if (!node) {
        return {
            authorized: false,
            response: NextResponse.json({ error: "Node not found" }, { status: 404 }),
        };
    }

    const access = await verifyProjectWriteAccess(node.projectId, userId, userEmail);
    if (!access.authorized) return access;
    return { authorized: true, projectId: node.projectId, role: access.role };
}

/**
 * Validate that state-changing API requests include the expected custom header.
 * Browsers cannot add custom headers to cross-origin form submissions or simple
 * cross-origin fetch requests, so this blocks HTML-form CSRF and
 * non-credentialed cross-origin fetch attacks.
 *
 * The frontend must send `X-CSRF-Protection: 1` on all DELETE/PUT/POST calls.
 */
export function validateCsrfHeader(request: NextRequest): NextResponse | null {
    const header = request.headers.get("x-csrf-protection");
    if (header !== "1") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
}
