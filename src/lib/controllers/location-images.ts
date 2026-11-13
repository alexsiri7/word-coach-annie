import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db";
import { sanitizeInput } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";
import { NotFoundError, UserFacingError } from "@/lib/controllers/errors";
import { processLocationImage } from "@/lib/location-images/process";
import { purgeImageFiles } from "@/lib/location-images/files";
import { createSignedUrl, createSignedUrls, uploadObject } from "@/lib/storage/supabase-storage";
import type { LocationImageKind, LocationImageUpdateInput } from "@/schemas/location-images";

/** Signed URLs live an hour; long enough for a session, short enough that a leaked one goes stale. */
export const SIGNED_URL_TTL_SECONDS = 3600;

/** How long a browser may reuse a redirect to a signed URL; it must expire before the URL does. */
export const IMAGE_FILE_CACHE_SECONDS = SIGNED_URL_TTL_SECONDS - 600;

export type LocationImageVariant = "full" | "thumb";

/** Storage paths stay server-side: no API or MCP response carries them. */
const publicFields = {
    id: true,
    storyObjectId: true,
    kind: true,
    caption: true,
    orderIndex: true,
    isCover: true,
    width: true,
    height: true,
    bytes: true,
    sha256: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.LocationImageSelect;

export type LocationImage = Prisma.LocationImageGetPayload<{ select: typeof publicFields }>;

/**
 * Cover and order are read, then written, so two edits to one location must not
 * interleave; the loser of a race is told to retry rather than leaving two covers.
 */
async function serializable<T>(target: Record<string, string>, fn: (tx: DbClient) => Promise<T>): Promise<T> {
    try {
        return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
            logger.warn("Location image write conflict (P2034)", target);
            throw new UserFacingError("This location's images changed at the same time; please try again");
        }
        throw e;
    }
}

async function renumber(tx: DbClient, orderedIds: string[]) {
    await Promise.all(orderedIds.map((id, orderIndex) => tx.locationImage.update({ where: { id }, data: { orderIndex } })));
}

async function siblingIds(tx: DbClient, storyObjectId: string): Promise<string[]> {
    const rows = await tx.locationImage.findMany({
        where: { storyObjectId },
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: { id: true },
    });
    return rows.map((r) => r.id);
}

export class LocationImageController {
    static async list(storyObjectId: string): Promise<LocationImage[]> {
        return prisma.locationImage.findMany({
            where: { storyObjectId },
            orderBy: { orderIndex: "asc" },
            select: publicFields,
        });
    }

    /** The list plus signed URLs for both variants, minted in one storage call. */
    static async listWithSignedUrls(storyObjectId: string) {
        const rows = await prisma.locationImage.findMany({ where: { storyObjectId }, orderBy: { orderIndex: "asc" } });
        const signed = await createSignedUrls(rows.flatMap((r) => [r.storagePath, r.thumbPath]), SIGNED_URL_TTL_SECONDS);
        return rows.map(({ storagePath, thumbPath, ...row }) => ({
            ...row,
            url: signed.get(storagePath) ?? null,
            thumbUrl: signed.get(thumbPath) ?? null,
        }));
    }

    static async add(
        storyObjectId: string,
        input: Buffer,
        options: { kind?: LocationImageKind; caption?: string } = {},
    ): Promise<LocationImage> {
        const parent = await prisma.storyObject.findUnique({
            where: { id: storyObjectId },
            select: { projectId: true, type: true },
        });
        if (!parent) throw new NotFoundError("Story object not found");
        if (parent.type !== "LOCATION") throw new UserFacingError("Images can only be attached to locations");

        const image = await processLocationImage(input);
        const prefix = `${parent.projectId}/${storyObjectId}/${randomUUID()}`;
        const storagePath = `${prefix}/full.webp`;
        const thumbPath = `${prefix}/thumb.webp`;
        await uploadObject(storagePath, image.full, "image/webp");
        try {
            await uploadObject(thumbPath, image.thumb, "image/webp");
            return await serializable({ storyObjectId }, async (tx) => {
                const count = await tx.locationImage.count({ where: { storyObjectId } });
                return tx.locationImage.create({
                    data: {
                        storyObjectId,
                        kind: options.kind ?? "reference",
                        caption: sanitizeInput(options.caption ?? ""),
                        orderIndex: count,
                        isCover: count === 0,
                        storagePath,
                        thumbPath,
                        width: image.width,
                        height: image.height,
                        bytes: image.bytes,
                        sha256: image.sha256,
                    },
                    select: publicFields,
                });
            });
        } catch (e) {
            await purgeImageFiles([storagePath, thumbPath]);
            throw e;
        }
    }

    static async update(imageId: string, changes: LocationImageUpdateInput): Promise<LocationImage> {
        return serializable({ imageId }, async (tx) => {
            const image = await tx.locationImage.findUnique({ where: { id: imageId }, select: { storyObjectId: true } });
            if (!image) throw new NotFoundError("Location image not found");

            if (changes.orderIndex !== undefined) {
                const ids = (await siblingIds(tx, image.storyObjectId)).filter((id) => id !== imageId);
                ids.splice(Math.min(changes.orderIndex, ids.length), 0, imageId);
                await renumber(tx, ids);
            }
            if (changes.isCover) {
                await tx.locationImage.updateMany({
                    where: { storyObjectId: image.storyObjectId, isCover: true },
                    data: { isCover: false },
                });
            }
            return tx.locationImage.update({
                where: { id: imageId },
                data: {
                    ...(changes.caption !== undefined && { caption: sanitizeInput(changes.caption) }),
                    ...(changes.kind !== undefined && { kind: changes.kind }),
                    ...(changes.isCover !== undefined && { isCover: changes.isCover }),
                },
                select: publicFields,
            });
        });
    }

    /** A location that has images keeps a cover: deleting the cover promotes the new first image. */
    static async delete(imageId: string): Promise<{ deleted: true; id: string }> {
        const removed = await serializable({ imageId }, async (tx) => {
            const image = await tx.locationImage.findUnique({ where: { id: imageId } });
            if (!image) throw new NotFoundError("Location image not found");
            await tx.locationImage.delete({ where: { id: imageId } });
            const ids = await siblingIds(tx, image.storyObjectId);
            await renumber(tx, ids);
            if (image.isCover && ids.length > 0) {
                await tx.locationImage.update({ where: { id: ids[0] }, data: { isCover: true } });
            }
            return image;
        });
        await purgeImageFiles([removed.storagePath, removed.thumbPath]);
        return { deleted: true, id: imageId };
    }

    static async signedUrl(imageId: string, variant: LocationImageVariant): Promise<string> {
        const image = await prisma.locationImage.findUnique({
            where: { id: imageId },
            select: { storagePath: true, thumbPath: true },
        });
        if (!image) throw new NotFoundError("Location image not found");
        return createSignedUrl(variant === "thumb" ? image.thumbPath : image.storagePath, SIGNED_URL_TTL_SECONDS);
    }
}
