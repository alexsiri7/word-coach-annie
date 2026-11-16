import { z } from "zod";
import { NodeOrderIndex, NodeType, SceneStatus } from "@/schemas/nodes";
import { ContentHash } from "@/schemas/content-hash";
import { defineTool } from "./types";

export const getOutlineSpec = defineTool({
    name: "get_outline",
    description: "Get the full hierarchical manuscript outline (parts → chapters → scenes) with word counts and statuses",
    destructive: false,
    category: "core",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
    }),
});

export const createNodeSpec = defineTool({
    name: "create_node",
    description: "Create a new structure node (PART, CHAPTER, or SCENE) in the manuscript outline",
    destructive: false,
    category: "structure",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
        type: NodeType.describe("Node type"),
        title: z.string().describe("Node title"),
        parentId: z.string().optional().describe("Parent node ID (required for CHAPTER under PART, SCENE under CHAPTER)"),
        synopsis: z.string().optional().describe("Brief synopsis"),
        status: SceneStatus.optional().describe("Scene status (default OUTLINE)"),
        insertAfterIndex: z.number().optional().describe("Insert after this order index (appends to end if omitted)"),
    }),
});

export const updateNodeSpec = defineTool({
    name: "update_node",
    description: "Update a structure node's title, synopsis, status, order, or parent. Requires contentHash from get_outline to prevent stale overwrites.",
    destructive: false,
    category: "structure",
    parameters: z.object({
        nodeId: z.string().describe("The node ID to update"),
        contentHash: ContentHash.node,
        title: z.string().optional().describe("New title"),
        synopsis: z.string().optional().describe("New synopsis"),
        status: SceneStatus.optional().describe("New status"),
        orderIndex: NodeOrderIndex.optional().describe("New order index"),
        parentId: z.string().nullable().optional().describe("New parent node ID (null to make top-level)"),
    }),
});

export const deleteNodeSpec = defineTool({
    name: "delete_node",
    description: "Delete a structure node and all its children, content versions, and relationships.",
    destructive: true,
    category: "structure",
    parameters: z.object({
        nodeId: z.string().describe("The node ID to delete"),
    }),
});

export const readSceneContentSpec = defineTool({
    name: "read_scene_content",
    description: "Read the latest content of a scene (returns HTML content, word count, list of annotations, a contentHash for stale-write protection, and a paragraphs array [{index, type, content, contentHash}] for targeted paragraph updates)",
    destructive: false,
    category: "core",
    parameters: z.object({
        nodeId: z.string().describe("The scene node ID"),
    }),
});

export const writeSceneContentSpec = defineTool({
    name: "write_scene_content",
    description: "Write new content to a scene. Provide either 'content' (HTML string for author-written prose) or 'blocks' (structured beat array). Annie uses BEAT blocks by default; CONTENT blocks are permitted only when the author explicitly requests prose. Creates a new version. Requires contentHash from read_scene_content to prevent stale overwrites.",
    destructive: false,
    category: "structure",
    parameters: z.object({
        nodeId: z.string().describe("The scene node ID"),
        contentHash: ContentHash.scene,
        content: z.string().optional().describe("The HTML content to write"),
        blocks: z.array(z.object({
            type: z.enum(["CONTENT", "BEAT"]),
            content: z.string()
        })).optional().describe("Structured content blocks")
    }),
});

export const updateParagraphSpec = defineTool({
    name: "update_paragraph",
    description: "Patch a single paragraph or beat within a scene by its index (from read_scene_content paragraphs array). Requires paragraphContentHash from the paragraph entry to prevent stale overwrites. Optionally also accepts sceneContentHash for scene-level stale detection. Set intent: 'editorial' when correcting or rearranging the author's existing words rather than replacing them with AI-generated prose.",
    destructive: false,
    parameters: z.object({
        nodeId: z.string().describe("The scene node ID"),
        index: z.number().int().describe("The paragraph index from the paragraphs array"),
        content: z.string().describe("New content for this paragraph (must match the existing type — CONTENT or BEAT)"),
        paragraphContentHash: z.string().describe("The contentHash from the paragraphs[index] entry in read_scene_content"),
        sceneContentHash: z.string().optional().describe("Optional scene-level contentHash from read_scene_content for additional stale protection"),
        intent: z.enum(["editorial", "creative"]).optional().describe("Intent signal: 'editorial' means the author's existing words are being corrected or rearranged (not replaced with AI-generated prose) — the prose-writing guard does not apply. When absent or 'creative', standard prose-writing rules apply."),
    }),
});

export const insertBeatSpec = defineTool({
    name: "insert_beat",
    description: "Insert a new beat block after a specified paragraph index in a scene. Use this tool for structural waypoints (beats), not prose — it writes only a BEAT block, keeping Annie's structural-vs-prose separation intact.",
    destructive: false,
    parameters: z.object({
        nodeId: z.string().describe("The scene node ID"),
        afterParagraphIndex: z
            .number()
            .int()
            .describe(
                "Scene-level paragraph index (from read_scene_content paragraphs array). Each <p> element and each BEAT block is one paragraph. Use -1 to insert before all paragraphs, 0 to insert after the first paragraph, etc. When the target falls inside a CONTENT block, the block is split automatically.",
            ),
        beatContent: z.string().describe("The beat text to insert (structural waypoint — not prose)"),
        sceneContentHash: z
            .string()
            .optional()
            .describe("Optional scene-level contentHash from read_scene_content for stale detection"),
    }),
});

export const deleteBeatSpec = defineTool({
    name: "delete_beat",
    description: "Delete a single beat block from a scene by its index (from read_scene_content paragraphs array). Only beats can be deleted — prose paragraphs are refused. Requires paragraphContentHash from the paragraph entry to prevent stale deletes. Creates a new scene version, so restore_scene_version can undo it.",
    destructive: false,
    parameters: z.object({
        nodeId: z.string().describe("The scene node ID"),
        index: z.number().int().describe("The paragraph index of the beat, from the paragraphs array"),
        paragraphContentHash: z.string().describe("The contentHash from the paragraphs[index] entry in read_scene_content"),
        sceneContentHash: z.string().optional().describe("Optional scene-level contentHash from read_scene_content for additional stale protection"),
    }),
});

export const getSceneVersionsSpec = defineTool({
    name: "get_scene_versions",
    description: "List the version history of a scene (timestamps and word counts)",
    destructive: false,
    category: "structure",
    parameters: z.object({
        nodeId: z.string().describe("The scene node ID"),
        limit: z.number().optional().describe("Max versions to return (default 20)"),
    }),
});

export const restoreSceneVersionSpec = defineTool({
    name: "restore_scene_version",
    description: "Restore a previous version of a scene's content. Creates a new version from the old content (non-destructive).",
    destructive: false,
    category: "structure",
    parameters: z.object({
        nodeId: z.string().describe("The scene node ID"),
        versionId: z.string().describe("The version ID to restore"),
    }),
});

export const addAnnotationSpec = defineTool({
    name: "add_annotation",
    description: "Add an annotation to a node",
    destructive: false,
    category: "structure",
    parameters: z.object({
        nodeId: z.string().describe("The node ID"),
        content: z.string().describe("Annotation content"),
        range: z.string().optional().describe("Text range"),
        selectedText: z.string().optional().describe("Selected text"),
    }),
});

export const updateAnnotationSpec = defineTool({
    name: "update_annotation",
    description: "Update an existing annotation",
    destructive: false,
    category: "structure",
    parameters: z.object({
        annotationId: z.string().describe("The annotation ID"),
        content: z.string().optional().describe("New content"),
        resolved: z.boolean().optional().describe("Resolved status"),
    }),
});

export const deleteAnnotationSpec = defineTool({
    name: "delete_annotation",
    description: "Delete an annotation",
    destructive: true,
    category: "structure",
    parameters: z.object({
        annotationId: z.string().describe("The annotation ID"),
    }),
});

export const resolveAnnotationSpec = defineTool({
    name: "resolve_annotation",
    description: "Resolve or unresolve an annotation",
    destructive: false,
    category: "structure",
    parameters: z.object({
        annotationId: z.string().describe("The annotation ID"),
        resolved: z.boolean().describe("Resolved status"),
    }),
});

export const getOpenAnnotationsSpec = defineTool({
    name: "get_open_annotations",
    description: "Get all unresolved annotations across the project (or filtered by project ID). Useful as an inbox of tasks.",
    destructive: false,
    category: "core",
    parameters: z.object({
        projectId: z.string().optional().describe("Optional project ID to filter by."),
    }),
});

export const batchCreateNodesSpec = defineTool({
    name: "batch_create_nodes",
    description: "Create multiple structure nodes (PART, CHAPTER, SCENE) in a single operation. Nodes are created sequentially, so earlier entries can serve as parents for later ones. Max 50 per batch.",
    destructive: false,
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
        nodes: z.array(z.object({
            type: NodeType.describe("Node type"),
            title: z.string().describe("Node title"),
            parentId: z.string().optional().describe("Parent node ID"),
            synopsis: z.string().optional().describe("Brief synopsis"),
            status: SceneStatus.optional().describe("Scene status (default OUTLINE)"),
        })).describe("Array of nodes to create"),
    }),
});

export const batchUpdateNodesSpec = defineTool({
    name: "batch_update_nodes",
    description: "Update multiple structure nodes in a single operation. Returns per-item results with successes and errors. Max 50 per batch.",
    destructive: false,
    parameters: z.object({
        updates: z.array(z.object({
            nodeId: z.string().describe("The node ID to update"),
            title: z.string().optional().describe("New title"),
            synopsis: z.string().optional().describe("New synopsis"),
            status: SceneStatus.optional().describe("New status"),
            orderIndex: NodeOrderIndex.optional().describe("New order index"),
            parentId: z.string().nullable().optional().describe("New parent node ID (null to make top-level)"),
        })).describe("Array of updates to apply"),
    }),
});

export const batchDeleteNodesSpec = defineTool({
    name: "batch_delete_nodes",
    description: "Delete multiple structure nodes and their children in a single operation. Max 50 per batch.",
    destructive: true,
    parameters: z.object({
        nodeIds: z.array(z.string()).describe("Array of node IDs to delete"),
    }),
});
