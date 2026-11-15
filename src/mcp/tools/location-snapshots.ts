import { LocationSnapshotController } from "@/lib/controllers/location-snapshots";
import { UserFacingError } from "@/lib/controllers/errors";
import {
    SnapshotAnnotationCreateSchema,
    SnapshotAnnotationUpdateSchema,
} from "@/schemas/location-snapshots";

function parseOrThrow<T>(result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }): T {
    if (!result.success) throw new UserFacingError(result.error.issues[0]?.message ?? "Invalid input");
    return result.data;
}

export async function listLocationSnapshots(storyObjectId: string) {
    const { snapshots, annotations } = await LocationSnapshotController.list(storyObjectId);
    return {
        snapshots,
        notesFromDeletedSnapshots: annotations.filter((a) => a.kind === "note" && a.snapshotId === null),
    };
}

/** The snapshot with its things, a signed image URL, its notes and the location's name/description requests. */
export async function getLocationSnapshot(snapshotId: string) {
    const snapshot = await LocationSnapshotController.get(snapshotId);
    const [imageUrl, annotations] = await Promise.all([
        LocationSnapshotController.signedUrl(snapshotId),
        LocationSnapshotController.reviewAnnotations(snapshot),
    ]);
    return { ...snapshot, imageUrl, annotations };
}

export async function addSnapshotAnnotation(snapshotId: string, input: unknown) {
    return LocationSnapshotController.addAnnotation(snapshotId, parseOrThrow(SnapshotAnnotationCreateSchema.safeParse(input)));
}

export async function updateSnapshotAnnotation(annotationId: string, changes: unknown) {
    return LocationSnapshotController.updateAnnotation(annotationId, parseOrThrow(SnapshotAnnotationUpdateSchema.safeParse(changes)));
}
