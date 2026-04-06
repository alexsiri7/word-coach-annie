import { z } from "zod";

export const WorldObjectCreateSchema = z.object({
  type: z.string().min(1, "type is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  notes: z.string().optional(),
  tags: z.string().optional(),
});

export const WorldObjectUpdateSchema = z
  .object({
    type: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    notes: z.string().optional(),
    tags: z.string().optional(),
  })
  .refine((obj) => Object.values(obj).some((v) => v !== undefined), {
    message: "No fields to update",
  });

export type WorldObjectCreateInput = z.infer<typeof WorldObjectCreateSchema>;
export type WorldObjectUpdateInput = z.infer<typeof WorldObjectUpdateSchema>;
