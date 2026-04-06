import { z } from "zod";

export const ProjectCreateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  author: z.string().optional(),
  synopsis: z.string().optional(),
  genre: z.string().optional(),
  projectType: z.enum(["FICTION", "ARTICLE_COLLECTION", "GENERAL"]).optional(),
});

export const ProjectUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    author: z.string().optional(),
    synopsis: z.string().optional(),
    genre: z.string().optional(),
    projectType: z.enum(["FICTION", "ARTICLE_COLLECTION", "GENERAL"]).optional(),
    aiInstructions: z.string().optional(),
    archivedAt: z.string().nullable().optional(),
  })
  .refine((obj) => Object.values(obj).some((v) => v !== undefined), {
    message: "No fields to update",
  });

export const ProjectDeleteSchema = z.object({
  confirmTitle: z.string().min(1, "You must type the project title to confirm deletion"),
});

export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateSchema>;
export type ProjectDeleteInput = z.infer<typeof ProjectDeleteSchema>;
