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
 * Verify that a project belongs to the current user.
 * Returns the project if accessible, or a 403/404 response.
 * When userId is null (API_TOKEN/dev mode), all projects are accessible.
 * Unowned projects (NULL userId) are denied to authenticated users.
 */
export async function verifyProjectAccess(
    projectId: string,
    userId: string | null
): Promise<{ authorized: true; project: { id: string; userId: string | null } } | { authorized: false; response: NextResponse }> {
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
        return { authorized: true, project };
    }

    if (project.userId !== userId) {
        return {
            authorized: false,
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
    }

    return { authorized: true, project };
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
