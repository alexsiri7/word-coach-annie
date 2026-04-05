import { z } from "zod";

export const UniverseCreateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

export const UniverseUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  .refine((obj) => Object.values(obj).some((v) => v !== undefined), {
    message: "No fields to update",
  });

export type UniverseCreateInput = z.infer<typeof UniverseCreateSchema>;
export type UniverseUpdateInput = z.infer<typeof UniverseUpdateSchema>;
