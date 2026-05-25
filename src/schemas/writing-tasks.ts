import { z } from "zod";

export const WritingTaskImportance = z.enum(["Critical", "High", "Medium"]);
export const WritingTaskSize = z.enum(["Small", "Medium", "Large"]);
export const WritingTaskEnergy = z.enum(["Introspective", "Dramatic", "Technical"]);

export const WritingTaskCreateSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  sceneId: z.string().optional(),
  name: z.string().min(1, "name is required"),
  whatIsNeeded: z.string().optional(),
  importance: WritingTaskImportance.optional().default("Medium"),
  size: WritingTaskSize.optional().default("Medium"),
  energy: WritingTaskEnergy.optional().default("Technical"),
});

export const WritingTaskUpdateSchema = z.object({
  name: z.string().min(1, "name must be non-empty").optional(),
  whatIsNeeded: z.string().optional(),
  importance: WritingTaskImportance.optional(),
  size: WritingTaskSize.optional(),
  energy: WritingTaskEnergy.optional(),
  completed: z.boolean().optional(),
});

export type WritingTaskImportanceValue = z.infer<typeof WritingTaskImportance>;
export type WritingTaskSizeValue = z.infer<typeof WritingTaskSize>;
export type WritingTaskEnergyValue = z.infer<typeof WritingTaskEnergy>;
export type WritingTaskCreateInput = z.infer<typeof WritingTaskCreateSchema>;
export type WritingTaskUpdateInput = z.infer<typeof WritingTaskUpdateSchema>;
