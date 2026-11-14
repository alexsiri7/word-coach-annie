import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";

/** Location snapshots are owner-only, like location images. */
export async function verifyLocationSnapshotAccess(
    request: NextRequest,
    snapshotId: string,
): Promise<NextResponse | null> {
    const snapshot = await prisma.locationSnapshot.findUnique({
        where: { id: snapshotId },
        select: { storyObject: { select: { projectId: true } } },
    });
    if (!snapshot) return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    const access = await verifyProjectAccess(snapshot.storyObject.projectId, getCurrentUserId(request));
    return access.authorized ? null : access.response;
}

export async function verifySnapshotAnnotationAccess(
    request: NextRequest,
    annotationId: string,
): Promise<NextResponse | null> {
    const annotation = await prisma.snapshotAnnotation.findUnique({
        where: { id: annotationId },
        select: { location: { select: { projectId: true } } },
    });
    if (!annotation) return NextResponse.json({ error: "Annotation not found" }, { status: 404 });
    const access = await verifyProjectAccess(annotation.location.projectId, getCurrentUserId(request));
    return access.authorized ? null : access.response;
}
