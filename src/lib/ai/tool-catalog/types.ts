import type { ZodObject, ZodRawShape } from "zod";

/** In-app chat tier: "core" is always loaded, the rest on demand via load_toolset. */
export type ToolCategory =
    | "core"
    | "structure"
    | "characters"
    | "world_building"
    | "export"
    | "admin"
    | "skills";

/** One AI tool's contract — registered as-is on MCP and, when it has a category, in the in-app chat. */
export interface ToolSpec<Shape extends ZodRawShape = ZodRawShape> {
    name: string;
    description: string;
    parameters: ZodObject<Shape>;
    /** Refused unless destructive tools are allowed (MCP_ALLOW_DESTRUCTIVE), on every surface. */
    destructive: boolean;
    /** The chat tier that loads this tool; absent means MCP only. */
    category?: ToolCategory;
}

export function defineTool<Shape extends ZodRawShape>(spec: ToolSpec<Shape>): ToolSpec<Shape> {
    return spec;
}
