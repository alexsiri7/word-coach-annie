import { z } from "zod";
import { compareCodePoints } from "@/lib/location-snapshots/slug";

/** Zod 4 numbers are finite, so NaN and Infinity never reach a stored box or region. */
export const SnapshotThingSchema = z.object({
  key: z.string().min(1, "Every thing needs a key").max(200),
  name: z.string().max(200),
  description: z.string().max(5000).default(""),
  kind: z.string().max(50).default(""),
  box: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number().min(0),
    h: z.number().min(0),
  }),
});

export const SnapshotThingsSchema = z
  .array(SnapshotThingSchema)
  .max(500, "At most 500 things per snapshot")
  .refine((things) => new Set(things.map((t) => t.key)).size === things.length, {
    message: "Thing keys must be unique",
  });

export type SnapshotThing = z.infer<typeof SnapshotThingSchema>;

/**
 * The stored form of a snapshot's things: sorted by key. Parsed things carry the
 * schema's key order, so two equal lists stringify identically even after jsonb
 * has reordered the stored object keys.
 */
export function canonicalThings(things: SnapshotThing[]): SnapshotThing[] {
  return [...things].sort((a, b) => compareCodePoints(a.key, b.key));
}

export const SnapshotIngestFieldsSchema = z.object({
  build: z.string().trim().min(1, "build is required").max(200, "build must be at most 200 characters"),
  takenAt: z.coerce.date({ error: "takenAt must be a date" }),
});

/** Coordinates are in the uploaded screenshot's pixels, like thing boxes. */
export const SnapshotRegionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("point"), x: z.number(), y: z.number() }),
  z.object({ type: z.literal("rect"), x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }),
  z.object({ type: z.literal("path"), points: z.array(z.tuple([z.number(), z.number()])).min(2).max(1000) }),
]);

export type SnapshotRegion = z.infer<typeof SnapshotRegionSchema>;

export const SnapshotAnnotationKindSchema = z.enum(["note", "description", "name"]);
export const SnapshotAnnotationStatusSchema = z.enum(["open", "sent", "done"]);

export type SnapshotAnnotationKind = z.infer<typeof SnapshotAnnotationKindSchema>;
export type SnapshotAnnotationStatus = z.infer<typeof SnapshotAnnotationStatusSchema>;

/** A description may be cleared; a note and a name need text. */
const ANNOTATION_TEXT = {
  note: z.string().trim().min(1, "A note needs text").max(5000, "text must be at most 5000 characters"),
  description: z.string().trim().max(5000, "text must be at most 5000 characters"),
  name: z.string().trim().min(1, "A name needs text").max(200, "A name must be at most 200 characters"),
} satisfies Record<SnapshotAnnotationKind, z.ZodType<string>>;

export function annotationTextSchema(kind: SnapshotAnnotationKind) {
  return ANNOTATION_TEXT[kind];
}

const ThingKeySchema = z.string().min(1).max(200);
const notForEdits = z.undefined({ error: "Only notes have a region or a linked story object" });

const ThingEditFields = {
  thingKey: ThingKeySchema,
  region: notForEdits.optional(),
  storyObjectId: notForEdits.optional(),
};

export const SnapshotAnnotationCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("note"),
    text: ANNOTATION_TEXT.note,
    region: SnapshotRegionSchema.optional(),
    thingKey: ThingKeySchema.optional(),
    storyObjectId: z.string().min(1).optional(),
  }),
  z.object({ kind: z.literal("description"), text: ANNOTATION_TEXT.description, ...ThingEditFields }),
  z.object({ kind: z.literal("name"), text: ANNOTATION_TEXT.name, ...ThingEditFields }),
]);

export const SnapshotAnnotationUpdateSchema = z
  .object({
    text: z.string().max(5000, "text must be at most 5000 characters").optional(),
    status: SnapshotAnnotationStatusSchema.optional(),
    region: SnapshotRegionSchema.optional(),
    storyObjectId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: "No fields to update",
  });

export type SnapshotAnnotationCreateInput = z.infer<typeof SnapshotAnnotationCreateSchema>;
export type SnapshotAnnotationUpdateInput = z.infer<typeof SnapshotAnnotationUpdateSchema>;
