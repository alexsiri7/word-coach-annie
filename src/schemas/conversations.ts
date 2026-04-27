import { z } from "zod";

export const ConversationCreateSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  title: z.string().optional(),
  type: z.enum(["chat", "review"]).optional(),
});

export const ConversationUpdateSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
});

export type ConversationCreateInput = z.infer<typeof ConversationCreateSchema>;
export type ConversationUpdateInput = z.infer<typeof ConversationUpdateSchema>;
