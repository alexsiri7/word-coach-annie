import { z } from "zod";

export const RelationshipType = z.enum([
  "APPEARS_IN",
  "LOCATED_AT",
  "PART_OF_PLOTLINE",
  "RELATED_TO",
  "INTERACTS_WITH",
  "CONTAINS",
  "PRECEDES",
  "FOLLOWS",
]);

export const RelationshipCreateSchema = z
  .object({
    type: RelationshipType,
    label: z.string().optional(),
    fromNodeId: z.string().optional(),
    fromObjectId: z.string().optional(),
    toNodeId: z.string().optional(),
    toObjectId: z.string().optional(),
  })
  .refine(
    (data) => [data.fromNodeId, data.fromObjectId].filter(Boolean).length === 1,
    {
      message:
        "Exactly one from-field must be provided (fromNodeId or fromObjectId)",
    }
  )
  .refine(
    (data) => [data.toNodeId, data.toObjectId].filter(Boolean).length === 1,
    {
      message:
        "Exactly one to-field must be provided (toNodeId or toObjectId)",
    }
  );

export type RelationshipTypeValue = z.infer<typeof RelationshipType>;
export type RelationshipCreateInput = z.infer<typeof RelationshipCreateSchema>;
