import { z } from "zod";

export const NodeType = z.enum(["PART", "CHAPTER", "SCENE"]);
export const SceneStatus = z.enum(["OUTLINE", "DRAFT", "REVISED", "FINAL"]);

export const NodeCreateSchema = z.object({
  type: NodeType,
  title: z.string().min(1, "title is required"),
  parentId: z.string().optional(),
  synopsis: z.string().optional(),
  status: SceneStatus.optional(),
  insertAfterIndex: z.number().int().optional(),
});

export const NodeUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  synopsis: z.string().optional(),
  status: SceneStatus.optional(),
  orderIndex: z.number().int().optional(),
  parentId: z.string().nullable().optional(),
});

export type NodeTypeValue = z.infer<typeof NodeType>;
export type SceneStatusValue = z.infer<typeof SceneStatus>;
export type NodeCreateInput = z.infer<typeof NodeCreateSchema>;
export type NodeUpdateInput = z.infer<typeof NodeUpdateSchema>;
