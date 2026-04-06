import { z } from "zod";

export const StoryObjectType = z.enum([
  "CHARACTER",
  "LOCATION",
  "PLOTLINE",
  "WORLD_ELEMENT",
  "NOTE",
]);

export const StoryObjectCreateSchema = z.object({
  type: StoryObjectType,
  name: z.string().min(1, "name is required"),
  description: z.string().optional(),
  notes: z.string().optional(),
  role: z.string().optional(),
  tags: z.string().optional(),
});

export const StoryObjectUpdateSchema = z.object({
  name: z.string().min(1, "name must be a non-empty string").optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  role: z.string().nullable().optional(),
  tags: z.string().optional(),
});

export type StoryObjectTypeValue = z.infer<typeof StoryObjectType>;
export type StoryObjectCreateInput = z.infer<typeof StoryObjectCreateSchema>;
export type StoryObjectUpdateInput = z.infer<typeof StoryObjectUpdateSchema>;
