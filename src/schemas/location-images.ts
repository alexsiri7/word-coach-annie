import { z } from "zod";

export const LocationImageKindSchema = z.enum(["reference", "mood", "sketch"]);

export const LocationImageCaptionSchema = z.string().max(500, "caption must be at most 500 characters");

export const LocationImageUpdateSchema = z
  .object({
    caption: LocationImageCaptionSchema.optional(),
    kind: LocationImageKindSchema.optional(),
    orderIndex: z.number().int().min(0).optional(),
    isCover: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: "No fields to update",
  });

export type LocationImageKind = z.infer<typeof LocationImageKindSchema>;
export type LocationImageUpdateInput = z.infer<typeof LocationImageUpdateSchema>;
