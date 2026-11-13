import { randomUUID } from "node:crypto";
import { Prisma, type LocationMap } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db";
import { sanitizeInput } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";
import { NotFoundError, UserFacingError } from "@/lib/controllers/errors";
import { computeContentHash, verifyContentHash } from "@/mcp/content-hash";
import {
    describeLocationMapError,
    LOCATION_MAP_LINK_TYPES,
    LocationMapInputSchema,
    LocationMapItemSchema,
    type LocationMapInput,
    type LocationMapItem,
    type LocationMapItemUpsert,
} from "@/schemas/location-map";

/** linkName is the linked story object's current name, so renames follow without rewriting maps. */
export type LocationMapItemView = LocationMapItem & { linkName: string | null; unlinked: boolean };

export type LocationMapView = {
    id: string;
    storyObjectId: string;
    widthM: number;
    heightM: number;
    backgroundImageId: string | null;
    items: LocationMapItemView[];
    updatedAt: Date;
    contentHash: string;
};

type Location = { id: string; projectId: string };

/** Item edits read the stored list, then write it back, so two edits to one map must not interleave. */
async function serializable<T>(storyObjectId: string, fn: (tx: DbClient) => Promise<T>): Promise<T> {
    try {
        return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
            logger.warn("Location map write conflict (P2034)", { storyObjectId });
            throw new UserFacingError("This location's map changed at the same time; please try again");
        }
        throw e;
    }
}

async function requireLocation(db: DbClient, storyObjectId: string): Promise<Location> {
    const location = await db.storyObject.findUnique({
        where: { id: storyObjectId },
        select: { id: true, projectId: true, type: true },
    });
    if (!location) throw new NotFoundError("Story object not found");
    if (location.type !== "LOCATION") throw new UserFacingError("Maps can only be attached to locations");
    return location;
}

function linkOf(item: LocationMapItem): string | null {
    return item.storyObjectId ?? item.targetLocationId ?? null;
}

function storedItems(items: Prisma.JsonValue): LocationMapItem[] {
    return LocationMapItemSchema.array().parse(items);
}

function hashOf(map: Pick<LocationMapInput, "widthM" | "heightM" | "backgroundImageId" | "items">): string {
    const { widthM, heightM, backgroundImageId, items } = map;
    return computeContentHash(JSON.stringify({ widthM, heightM, backgroundImageId, items }));
}

async function toView(
    db: DbClient,
    location: Location,
    row: LocationMap,
): Promise<LocationMapView> {
    const items = storedItems(row.items);
    const ids = [...new Set(items.map(linkOf).filter((id): id is string => id !== null))];
    const linked = ids.length === 0
        ? []
        : await db.storyObject.findMany({
            where: { id: { in: ids }, projectId: location.projectId },
            select: { id: true, name: true },
        });
    const names = new Map(linked.map((o) => [o.id, o.name]));
    const map = {
        widthM: row.widthM,
        heightM: row.heightM,
        backgroundImageId: row.backgroundImageId,
        items,
    };
    return {
        id: row.id,
        storyObjectId: row.storyObjectId,
        ...map,
        items: items.map((item) => {
            const link = linkOf(item);
            const linkName = link === null ? null : names.get(link) ?? null;
            return { ...item, linkName, unlinked: link !== null && linkName === null };
        }),
        updatedAt: row.updatedAt,
        contentHash: hashOf(map),
    };
}

/**
 * Links must point at a story object of the right type in this project. A link the
 * same item already holds, as the same kind, is kept as it is even if its target was
 * deleted, so an unlinked item survives a re-save.
 */
async function checkReferences(db: DbClient, location: Location, map: LocationMapInput, previous: LocationMapItem[]) {
    if (map.backgroundImageId !== null) {
        const image = await db.locationImage.findUnique({
            where: { id: map.backgroundImageId },
            select: { storyObjectId: true },
        });
        if (image?.storyObjectId !== location.id) {
            throw new UserFacingError("backgroundImageId must be one of this location's images");
        }
    }

    const kept = new Map(previous.map((item) => [item.id, `${item.kind}:${linkOf(item)}`]));
    const toCheck = map.items.flatMap((item) => {
        const link = linkOf(item);
        return link !== null && kept.get(item.id) !== `${item.kind}:${link}` ? [{ item, link }] : [];
    });
    if (toCheck.length === 0) return;

    const targets = await db.storyObject.findMany({
        where: { id: { in: toCheck.map(({ link }) => link) }, projectId: location.projectId },
        select: { id: true, type: true },
    });
    const typeOf = new Map(targets.map((t) => [t.id, t.type]));
    for (const { item, link } of toCheck) {
        const expected = LOCATION_MAP_LINK_TYPES[item.kind];
        if (typeOf.get(link) !== expected) {
            const field = item.kind === "exit" ? "targetLocationId" : "storyObjectId";
            throw new UserFacingError(`Item ${item.id}: ${field} must be a ${expected} in this project`);
        }
    }
}

function clean(map: LocationMapInput): LocationMapInput {
    return {
        ...map,
        items: map.items.map((item) => ({
            ...item,
            label: sanitizeInput(item.label),
            description: sanitizeInput(item.description),
        })),
    };
}

async function write(db: DbClient, location: Location, map: LocationMapInput, previous: LocationMapItem[]) {
    await checkReferences(db, location, map, previous);
    const { widthM, heightM, backgroundImageId, items } = clean(map);
    const data = { widthM, heightM, backgroundImageId, items: items as Prisma.InputJsonValue };
    const row = await db.locationMap.upsert({
        where: { storyObjectId: location.id },
        create: { storyObjectId: location.id, ...data },
        update: data,
    });
    return toView(db, location, row);
}

function validated(map: unknown): LocationMapInput {
    const parsed = LocationMapInputSchema.safeParse(map);
    if (!parsed.success) throw new UserFacingError(describeLocationMapError(parsed.error));
    return parsed.data;
}

export class LocationMapController {
    static async get(storyObjectId: string): Promise<LocationMapView | null> {
        const location = await requireLocation(prisma, storyObjectId);
        const row = await prisma.locationMap.findUnique({ where: { storyObjectId } });
        return row ? toView(prisma, location, row) : null;
    }

    /**
     * Creates or replaces the map. With `requireContentHash`, replacing an existing map
     * needs the contentHash of the version the caller read.
     */
    static async set(
        storyObjectId: string,
        map: LocationMapInput,
        options: { contentHash?: string; requireContentHash?: boolean } = {},
    ): Promise<LocationMapView> {
        return serializable(storyObjectId, async (tx) => {
            const location = await requireLocation(tx, storyObjectId);
            const current = await tx.locationMap.findUnique({ where: { storyObjectId } });
            const previous = current ? storedItems(current.items) : [];
            if (current && options.requireContentHash) {
                if (!options.contentHash) {
                    throw new UserFacingError("This location already has a map; call get_location_map and pass its contentHash");
                }
                verifyContentHash(options.contentHash, hashOf({ ...current, items: previous }), "get_location_map");
            }
            return write(tx, location, map, previous);
        });
    }

    /** Replaces the item with the same id in place, keeping its drawing order, or appends a new one. */
    static async upsertItem(storyObjectId: string, item: LocationMapItemUpsert) {
        return serializable(storyObjectId, async (tx) => {
            const location = await requireLocation(tx, storyObjectId);
            const current = await tx.locationMap.findUnique({ where: { storyObjectId } });
            if (!current) throw new UserFacingError("Create the map first with set_location_map");
            const previous = storedItems(current.items);
            const id = item.id ?? randomUUID();
            const index = previous.findIndex((existing) => existing.id === id);
            const items = index === -1
                ? [...previous, { ...item, id }]
                : previous.map((existing, i) => (i === index ? { ...item, id } : existing));
            const map = await write(tx, location, validated({ ...current, items }), previous);
            return { item: map.items.find((i) => i.id === id)!, map };
        });
    }

    static async deleteItem(storyObjectId: string, itemId: string): Promise<{ deleted: true; id: string }> {
        return serializable(storyObjectId, async (tx) => {
            await requireLocation(tx, storyObjectId);
            const current = await tx.locationMap.findUnique({ where: { storyObjectId } });
            const previous = current ? storedItems(current.items) : [];
            if (!previous.some((item) => item.id === itemId)) throw new NotFoundError("Map item not found");
            await tx.locationMap.update({
                where: { storyObjectId },
                data: { items: previous.filter((item) => item.id !== itemId) as Prisma.InputJsonValue },
            });
            return { deleted: true as const, id: itemId };
        });
    }

    static async delete(storyObjectId: string): Promise<{ deleted: true }> {
        await requireLocation(prisma, storyObjectId);
        const { count } = await prisma.locationMap.deleteMany({ where: { storyObjectId } });
        if (count === 0) throw new NotFoundError("This location has no map");
        return { deleted: true };
    }
}
