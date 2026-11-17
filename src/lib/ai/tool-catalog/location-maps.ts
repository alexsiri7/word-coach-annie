import { z } from "zod";
import { ContentHash } from "@/schemas/content-hash";
import { defineTool } from "./types";

const LOCATION_MAP_GEOMETRY =
    "Coordinates are metres from the map's top-left corner, y down: x, y is an item's centre, w, h its size, rotation degrees clockwise about the centre. " +
    "Item kinds: object (rectangle; storyObjectId may link a WORLD_ELEMENT), character (circle; storyObjectId may link a CHARACTER), " +
    "exit (door; targetLocationId may link another LOCATION), area (polygon; points is a list of [x, y] pairs, at least 3, relative to the item's centre and within ±w/2, ±h/2), note (pin). " +
    "Each item has id, kind, label, description, x, y, w, h, rotation and optionally points, storyObjectId, targetLocationId.";

export const getLocationMapSpec = defineTool({
    name: "get_location_map",
    description: `Read the top-down map of a LOCATION story object, or null if it has none. Returns widthM, heightM, backgroundImageId (a location image id or null), items and a contentHash for set_location_map. Each item also carries read-only linkName (the linked story object's current name) and unlinked (true when its link target was deleted). ${LOCATION_MAP_GEOMETRY}`,
    destructive: false,
    parameters: z.object({
        storyObjectId: z.string().describe("The LOCATION story object ID"),
    }),
});

export const setLocationMapSpec = defineTool({
    name: "set_location_map",
    description: `Create or replace the whole map of a LOCATION story object. Replacing an existing map requires contentHash from get_location_map. widthM and heightM are 1–200 m; at most 500 items. ${LOCATION_MAP_GEOMETRY}`,
    destructive: false,
    parameters: z.object({
        storyObjectId: z.string().describe("The LOCATION story object ID"),
        map: z.record(z.string(), z.unknown()).describe("{ widthM, heightM, backgroundImageId?, items: [...] }"),
        contentHash: ContentHash.locationMap.optional(),
    }),
});

export const upsertLocationMapItemSpec = defineTool({
    name: "upsert_location_map_item",
    description: `Add an item to a location's map, or replace the item with the same id. Without an id the item is appended with a new one. The map must exist (set_location_map). ${LOCATION_MAP_GEOMETRY}`,
    destructive: false,
    parameters: z.object({
        storyObjectId: z.string().describe("The LOCATION story object ID"),
        item: z.record(z.string(), z.unknown()).describe("The item; omit id to add a new one"),
    }),
});

export const deleteLocationMapItemSpec = defineTool({
    name: "delete_location_map_item",
    description: "Remove one item from a location's map. Cannot be undone.",
    destructive: true,
    parameters: z.object({
        storyObjectId: z.string().describe("The LOCATION story object ID"),
        itemId: z.string().describe("The map item ID"),
    }),
});
