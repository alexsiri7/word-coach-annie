import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { NotFoundError, UserFacingError } from "@/lib/controllers/errors";
import { StorageNotConfiguredError } from "@/lib/storage/supabase-storage";
import { logger } from "@/lib/logger";

/** Location images are owner-only (#1478), so shared readers and editors get 403. */
export async function verifyLocationImageAccess(
    request: NextRequest,
    imageId: string,
): Promise<NextResponse | null> {
    const image = await prisma.locationImage.findUnique({
        where: { id: imageId },
        select: { storyObject: { select: { projectId: true } } },
    });
    if (!image) return NextResponse.json({ error: "Image not found" }, { status: 404 });
    const access = await verifyProjectAccess(image.storyObject.projectId, getCurrentUserId(request));
    return access.authorized ? null : access.response;
}

/** Owner-only access to a story object's images and snapshots. */
export async function verifyStoryObjectAccess(request: NextRequest, id: string): Promise<NextResponse | null> {
    const storyObject = await prisma.storyObject.findUnique({ where: { id }, select: { projectId: true } });
    if (!storyObject) return NextResponse.json({ error: "Story object not found" }, { status: 404 });
    const access = await verifyProjectAccess(storyObject.projectId, getCurrentUserId(request));
    return access.authorized ? null : access.response;
}

export function locationImageErrorResponse(label: string, error: unknown): NextResponse {
    if (error instanceof StorageNotConfiguredError) {
        return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof UserFacingError) return NextResponse.json({ error: error.message }, { status: 400 });

    logger.error(`${label} error`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
