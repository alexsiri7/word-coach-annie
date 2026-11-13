import { z } from "zod";

/**
 * A location map's geometry, in metres from the map's top-left corner with y down:
 * `x, y` is an item's centre, `w, h` its size, `rotation` degrees clockwise about the
 * centre. An area's `points` are relative to its centre in its unrotated frame, so
 * moving, rotating and resizing work the same way for every kind.
 */

export const LOCATION_MAP_ITEM_KINDS = ["object", "character", "exit", "area", "note"] as const;
export const LocationMapItemKindSchema = z.enum(LOCATION_MAP_ITEM_KINDS);

const POINT_TOLERANCE_M = 0.01;

export function normaliseRotation(degrees: number): number {
  const r = degrees % 360;
  return r < 0 ? r + 360 : r;
}

const coordinate = z.number().finite().min(-1000).max(1000);
const size = z.number().finite().gt(0, "must be greater than 0").max(1000);
const PointSchema = z.tuple([z.number().finite(), z.number().finite()]);

const itemFields = z.object({
  id: z.string().min(1).max(64),
  kind: LocationMapItemKindSchema,
  label: z.string().max(100).default(""),
  description: z.string().max(2000).default(""),
  x: coordinate,
  y: coordinate,
  w: size,
  h: size,
  rotation: z.number().finite().default(0).transform(normaliseRotation),
  points: z.array(PointSchema).min(3).max(100).optional(),
  storyObjectId: z.string().min(1).nullable().optional(),
  targetLocationId: z.string().min(1).nullable().optional(),
});

function checkItemRules(item: Omit<z.output<typeof itemFields>, "id">, ctx: z.RefinementCtx) {
  if ((item.kind === "area") !== (item.points !== undefined)) {
    ctx.addIssue({ code: "custom", message: "points are required on area items and only allowed on them", path: ["points"] });
  }
  if (item.points?.some(([px, py]) => Math.abs(px) > item.w / 2 + POINT_TOLERANCE_M || Math.abs(py) > item.h / 2 + POINT_TOLERANCE_M)) {
    ctx.addIssue({ code: "custom", message: "area points must lie within the item's width and height", path: ["points"] });
  }
  if (item.storyObjectId != null && item.kind !== "object" && item.kind !== "character") {
    ctx.addIssue({ code: "custom", message: "storyObjectId is only allowed on object and character items", path: ["storyObjectId"] });
  }
  if (item.targetLocationId != null && item.kind !== "exit") {
    ctx.addIssue({ code: "custom", message: "targetLocationId is only allowed on exit items", path: ["targetLocationId"] });
  }
}

export const LocationMapItemSchema = itemFields.superRefine(checkItemRules);

/** An item for upsert_location_map_item: without an id it is appended with a new one. */
export const LocationMapItemUpsertSchema = itemFields.extend({ id: itemFields.shape.id.optional() }).superRefine(checkItemRules);

const mapSize = z.number().finite().min(1).max(200);

/** Unknown keys, such as the read-only linkName and unlinked a read returns, are stripped. */
export const LocationMapInputSchema = z
  .object({
    widthM: mapSize,
    heightM: mapSize,
    backgroundImageId: z.string().min(1).nullable().default(null),
    items: z.array(LocationMapItemSchema).max(500),
  })
  .superRefine((map, ctx) => {
    const seen = new Set<string>();
    for (const item of map.items) {
      if (seen.has(item.id)) ctx.addIssue({ code: "custom", message: `duplicate item id ${item.id}`, path: ["items"] });
      seen.add(item.id);
    }
  });

export type LocationMapItemKind = z.infer<typeof LocationMapItemKindSchema>;
export type LocationMapItem = z.output<typeof LocationMapItemSchema>;
export type LocationMapItemUpsert = z.output<typeof LocationMapItemUpsertSchema>;
export type LocationMapInput = z.output<typeof LocationMapInputSchema>;

/** An item as a read returns it: linkName is the linked story object's current name, so renames follow without rewriting maps. */
export type LocationMapItemView = LocationMapItem & { linkName: string | null; unlinked: boolean };

export type LocationMapLinkType = "CHARACTER" | "WORLD_ELEMENT" | "LOCATION";

/** The story-object type each kind may link to; the schema keeps links off the other kinds. */
export const LOCATION_MAP_LINK_TYPES: Record<LocationMapItemKind, LocationMapLinkType | null> = {
  character: "CHARACTER",
  object: "WORLD_ELEMENT",
  exit: "LOCATION",
  area: null,
  note: null,
};

/** The first problem, prefixed by where it is, e.g. `items.0.kind: Invalid option…`. */
export function describeLocationMapError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid map";
  const where = issue.path.map(String).join(".");
  return where ? `${where}: ${issue.message}` : issue.message;
}
