import { z } from "zod";

export const TimelineEntryCreateSchema = z.object({
  label: z.string().min(1, "label is required"),
  description: z.string().optional(),
  attributes: z.string().optional(),
  orderIndex: z.number().int().optional(),
  projectId: z.string().optional(),
});

export const TimelineEntryUpdateSchema = z
  .object({
    label: z.string().min(1).optional(),
    description: z.string().optional(),
    attributes: z.string().optional(),
    orderIndex: z.number().int().optional(),
  })
  .refine((obj) => Object.values(obj).some((v) => v !== undefined), {
    message: "No fields to update",
  });

export type TimelineEntryCreateInput = z.infer<typeof TimelineEntryCreateSchema>;
export type TimelineEntryUpdateInput = z.infer<typeof TimelineEntryUpdateSchema>;
