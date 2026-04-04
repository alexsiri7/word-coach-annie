import { z } from "zod";

// ─── Projects ────────────────────────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  title: z.string().min(1, "Title is required"),
  author: z.string().optional(),
  synopsis: z.string().optional(),
  genre: z.string().optional(),
  projectType: z.string().optional().default("FICTION"),
});
export type CreateProjectBody = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  synopsis: z.string().optional(),
  genre: z.string().optional(),
  projectType: z.string().optional(),
  archivedAt: z.string().datetime().nullable().optional(),
});
export type UpdateProjectBody = z.infer<typeof UpdateProjectSchema>;

export const DeleteProjectSchema = z.object({
  confirmTitle: z.string(),
});
export type DeleteProjectBody = z.infer<typeof DeleteProjectSchema>;

// ─── Hashnode Integration ─────────────────────────────────────────────────────

export const ConnectHashnodeSchema = z.object({
  accessToken: z.string().min(1, "accessToken is required"),
});
export type ConnectHashnodeBody = z.infer<typeof ConnectHashnodeSchema>;

// ─── Publish to Hashnode ──────────────────────────────────────────────────────

export const PublishStatusSchema = z.enum(["draft", "unlisted", "public"]);
export type PublishStatus = z.infer<typeof PublishStatusSchema>;

export const PublishToHashnodeSchema = z.object({
  nodeId: z.string().optional(),
  titleOverride: z.string().optional(),
  publishStatus: PublishStatusSchema.optional().default("draft"),
  tags: z.array(z.string()).optional(),
  canonicalUrl: z.string().optional(),
});
export type PublishToHashnodeBody = z.infer<typeof PublishToHashnodeSchema>;

export const HashnodeExportSchema = z.object({
  hashnodePostId: z.string(),
  hashnodePostUrl: z.string(),
  publishStatus: z.string(),
  nodeId: z.string().nullable(),
  lastSyncedAt: z.string(),
});
export type HashnodeExport = z.infer<typeof HashnodeExportSchema>;

// ─── AI Settings ──────────────────────────────────────────────────────────────

export const UpdateAiSettingsSchema = z.object({
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  customInstructions: z.string().optional(),
  coachingStyle: z.string().optional(),
  responseLength: z.string().optional(),
});
export type UpdateAiSettingsBody = z.infer<typeof UpdateAiSettingsSchema>;

export const AiSettingsResponseSchema = z.object({
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
  hasApiKey: z.boolean().optional(),
  scope: z.enum(["user", "global"]).optional(),
  customInstructions: z.string().nullable().optional(),
  coachingStyle: z.string().nullable().optional(),
  responseLength: z.string().nullable().optional(),
});
export type AiSettingsData = z.infer<typeof AiSettingsResponseSchema>;

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const SendChatMessageSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  message: z.string().min(1, "message is required"),
  sceneContext: z.string().optional(),
});
export type SendChatMessageBody = z.infer<typeof SendChatMessageSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.union([z.string(), z.date()]),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
