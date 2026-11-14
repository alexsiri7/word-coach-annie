import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { removeObjects } from "@/lib/storage/supabase-storage";

/** Storage paths of the matching story objects' images and snapshots, collected before their rows are deleted. */
export async function collectLocationFilePaths(where: Prisma.StoryObjectWhereInput): Promise<string[]> {
    const [images, snapshots] = await Promise.all([
        prisma.locationImage.findMany({ where: { storyObject: where }, select: { storagePath: true, thumbPath: true } }),
        prisma.locationSnapshot.findMany({ where: { storyObject: where }, select: { storagePath: true } }),
    ]);
    return [...images.flatMap((r) => [r.storagePath, r.thumbPath]), ...snapshots.map((r) => r.storagePath)];
}

/**
 * Best effort, never throws: callers delete rows first, so a failed purge
 * leaves orphaned files rather than rows pointing at missing files.
 */
export async function purgeImageFiles(paths: string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        try {
            await removeObjects(chunk);
        } catch (e) {
            logger.warn("Location image files not removed from storage", { count: chunk.length, error: String(e) });
        }
    }
}
