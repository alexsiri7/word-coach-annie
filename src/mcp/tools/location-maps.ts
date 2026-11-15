import type { z } from "zod";
import { LocationMapController } from "@/lib/controllers/location-maps";
import { UserFacingError } from "@/lib/controllers/errors";
import {
    describeLocationMapError,
    LocationMapInputSchema,
    LocationMapItemUpsertSchema,
} from "@/schemas/location-map";

/** Map and item arrive loosely typed so a bad one is refused with the schema's readable message. */
function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new UserFacingError(describeLocationMapError(parsed.error));
    return parsed.data;
}

export async function getLocationMap(storyObjectId: string) {
    return LocationMapController.get(storyObjectId);
}

export async function setLocationMap(storyObjectId: string, map: unknown, contentHash?: string) {
    return LocationMapController.set(storyObjectId, parse(LocationMapInputSchema, map), {
        contentHash,
        requireContentHash: true,
    });
}

export async function upsertLocationMapItem(storyObjectId: string, item: unknown) {
    return LocationMapController.upsertItem(storyObjectId, parse(LocationMapItemUpsertSchema, item));
}

export async function deleteLocationMapItem(storyObjectId: string, itemId: string) {
    return LocationMapController.deleteItem(storyObjectId, itemId);
}
