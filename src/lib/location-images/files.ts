import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { removeObjects } from "@/lib/storage/supabase-storage";

/** Storage paths of the matching images, collected before their rows are deleted. */
export async function collectImagePaths(where: Prisma.LocationImageWhereInput): Promise<string[]> {
    const rows = await prisma.locationImage.findMany({ where, select: { storagePath: true, thumbPath: true } });
    return rows.flatMap((r) => [r.storagePath, r.thumbPath]);
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
