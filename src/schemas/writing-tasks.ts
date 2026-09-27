import { z } from "zod";

export const WritingTaskImportance = z.enum(["Critical", "High", "Medium"]);
export const WritingTaskSize = z.enum(["Small", "Medium", "Large"]);
export const WritingTaskEnergy = z.enum(["Introspective", "Dramatic", "Technical"]);
export const WritingTaskKind = z.enum(["Draft", "Revise", "Read", "Gather", "Admin"]);
export const WritingTaskCapacity = z.enum(["Low", "Medium", "Full"]);
export const WritingTaskDueDate = z.union([z.iso.date(), z.iso.datetime()], {
  error: "dueDate must be an ISO 8601 date or date-time",
});

export const WritingTaskCreateSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  sceneId: z.string().optional(),
  name: z.string().min(1, "name is required"),
  whatIsNeeded: z.string().optional(),
  importance: WritingTaskImportance.optional().default("Medium"),
  size: WritingTaskSize.optional().default("Medium"),
  energy: WritingTaskEnergy.optional().default("Technical"),
  kind: WritingTaskKind.optional().default("Draft"),
  capacity: WritingTaskCapacity.optional().default("Full"),
  dueDate: WritingTaskDueDate.optional(),
});

export const WritingTaskUpdateSchema = z.object({
  name: z.string().min(1, "name must be non-empty").optional(),
  whatIsNeeded: z.string().optional(),
  importance: WritingTaskImportance.optional(),
  size: WritingTaskSize.optional(),
  energy: WritingTaskEnergy.optional(),
  kind: WritingTaskKind.optional(),
  capacity: WritingTaskCapacity.optional(),
  dueDate: WritingTaskDueDate.nullable().optional(),
  completed: z.boolean().optional(),
});

export type WritingTaskImportanceValue = z.infer<typeof WritingTaskImportance>;
export type WritingTaskSizeValue = z.infer<typeof WritingTaskSize>;
export type WritingTaskEnergyValue = z.infer<typeof WritingTaskEnergy>;
export type WritingTaskKindValue = z.infer<typeof WritingTaskKind>;
export type WritingTaskCapacityValue = z.infer<typeof WritingTaskCapacity>;
export type WritingTaskCreateInput = z.infer<typeof WritingTaskCreateSchema>;
export type WritingTaskUpdateInput = z.infer<typeof WritingTaskUpdateSchema>;
