import { listProjects, getProject, createProject, updateProject } from "@/mcp/tools/projects";
import {
    getOutline,
    createNode,
    updateNode,
    deleteNode,
    readSceneContent,
    writeSceneContent,
    writeSceneContentFromBlocks,
    getSceneVersions,
    restoreSceneVersion,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    resolveAnnotation,
    getOpenAnnotations,
} from "@/mcp/tools/structure";
import {
    listStoryObjects,
    getStoryObject,
    createStoryObject,
    updateStoryObject,
    deleteStoryObject,
} from "@/mcp/tools/story-objects";
import {
    listRelationships,
    createRelationship,
    deleteRelationship,
} from "@/mcp/tools/relationships";
import {
    exportManuscript,
    exportStoryBible,
    exportMedium,
    getProjectSummary,
} from "@/mcp/tools/export";
import {
    snapshotDatabase,
    listDatabaseSnapshots,
    restoreDatabaseSnapshot,
} from "@/mcp/tools/snapshots";
import {
    listUniverses,
    getUniverse,
    createUniverse,
    updateUniverse,
    deleteUniverse,
    listWorldObjects,
    getWorldObject,
    createWorldObject,
    updateWorldObject,
    deleteWorldObject,
    addTimelineEntry,
    updateTimelineEntry,
    deleteTimelineEntry,
    reorderTimelineEntries,
    transferStoryObjectToUniverse,
    linkProjectToUniverse,
    unlinkProjectFromUniverse,
} from "@/mcp/tools/universes";
import { listSkills } from "@/mcp/skills";
import { GoogleAuthController } from "@/lib/controllers/google-auth";
import { GoogleDocsExporter } from "@/lib/export/google-docs-exporter";

type Args = Record<string, unknown>;

/**
 * Route map: tool name → async handler function.
 * Each handler receives the raw args object and returns a result.
 */
const toolHandlers: Record<string, (args: Args) => Promise<unknown>> = {
    // Core
    list_projects: async (a) => listProjects(a.limit as number, a.offset as number),
    get_project: async (a) => getProject(a.projectId as string),
    get_outline: async (a) => getOutline(a.projectId as string),
    read_scene_content: async (a) => readSceneContent(a.nodeId as string),
    list_story_objects: async (a) => listStoryObjects(a as Parameters<typeof listStoryObjects>[0]),
    get_project_summary: async (a) => getProjectSummary(a.projectId as string),
    get_open_annotations: async (a) => getOpenAnnotations(a.projectId as string | undefined),
    list_skills: async () => listSkills(),

    // Structure
    create_node: async (a) => createNode(a as Parameters<typeof createNode>[0]),
    update_node: async (a) => {
        const { nodeId, ...data } = a;
        return updateNode(nodeId as string, data as Parameters<typeof updateNode>[1]);
    },
    delete_node: async (a) => deleteNode(a.nodeId as string),
    write_scene_content: async (a) => {
        if (a.blocks) {
            return writeSceneContentFromBlocks(
                a.nodeId as string,
                a.blocks as { type: "CONTENT" | "BEAT"; content: string }[],
            );
        }
        return writeSceneContent(a.nodeId as string, a.content as string);
    },
    get_scene_versions: async (a) => getSceneVersions(a.nodeId as string, a.limit as number),
    restore_scene_version: async (a) => restoreSceneVersion(a.nodeId as string, a.versionId as string),
    add_annotation: async (a) =>
        addAnnotation(a.nodeId as string, a.content as string, a.range as string, a.selectedText as string | null),
    update_annotation: async (a) => {
        const { annotationId, ...data } = a;
        return updateAnnotation(annotationId as string, data as Parameters<typeof updateAnnotation>[1]);
    },
    delete_annotation: async (a) => deleteAnnotation(a.annotationId as string),
    resolve_annotation: async (a) => resolveAnnotation(a.annotationId as string, a.resolved as boolean),

    // Characters / Story Objects
    get_story_object: async (a) => getStoryObject(a.objectId as string),
    create_story_object: async (a) => createStoryObject(a as Parameters<typeof createStoryObject>[0]),
    update_story_object: async (a) => {
        const { objectId, ...data } = a;
        return updateStoryObject(objectId as string, data as Parameters<typeof updateStoryObject>[1]);
    },
    delete_story_object: async (a) => deleteStoryObject(a.objectId as string),
    list_relationships: async (a) => listRelationships(a.projectId as string),
    create_relationship: async (a) => createRelationship(a as Parameters<typeof createRelationship>[0]),
    delete_relationship: async (a) => deleteRelationship(a.relationshipId as string),

    // World Building
    list_universes: async () => listUniverses(),
    get_universe: async (a) => getUniverse(a.universeId as string),
    create_universe: async (a) => createUniverse(a as Parameters<typeof createUniverse>[0]),
    update_universe: async (a) => {
        const { universeId, ...data } = a;
        return updateUniverse(universeId as string, data as Parameters<typeof updateUniverse>[1]);
    },
    delete_universe: async (a) => deleteUniverse(a.universeId as string),
    list_world_objects: async (a) => listWorldObjects(a.universeId as string, a.type as string | undefined),
    get_world_object: async (a) => getWorldObject(a.objectId as string),
    create_world_object: async (a) => createWorldObject(a as Parameters<typeof createWorldObject>[0]),
    update_world_object: async (a) => {
        const { objectId, ...data } = a;
        return updateWorldObject(objectId as string, data as Parameters<typeof updateWorldObject>[1]);
    },
    delete_world_object: async (a) => deleteWorldObject(a.objectId as string),
    add_timeline_entry: async (a) => addTimelineEntry(a as Parameters<typeof addTimelineEntry>[0]),
    update_timeline_entry: async (a) => {
        const { entryId, ...data } = a;
        return updateTimelineEntry(entryId as string, data as Parameters<typeof updateTimelineEntry>[1]);
    },
    delete_timeline_entry: async (a) => deleteTimelineEntry(a.entryId as string),
    reorder_timeline_entries: async (a) =>
        reorderTimelineEntries(a.worldObjectId as string, a.orderedIds as string[]),
    transfer_story_object_to_universe: async (a) =>
        transferStoryObjectToUniverse(a.storyObjectId as string, a.universeId as string),
    link_project_to_universe: async (a) =>
        linkProjectToUniverse(a.projectId as string, a.universeId as string),
    unlink_project_from_universe: async (a) =>
        unlinkProjectFromUniverse(a.projectId as string),

    // Export
    export_manuscript: async (a) => exportManuscript(a.projectId as string),
    export_story_bible: async (a) => exportStoryBible(a.projectId as string),
    export_medium: async (a) => exportMedium(a.projectId as string, a.nodeId as string | undefined),
    export_to_google_docs: async (a) => {
        const { projectId, universeId, exportMode } = a as {
            projectId?: string;
            universeId?: string;
            exportMode: "UNIVERSE" | "STORY_INTERNAL" | "STORY_READER";
        };
        if (!projectId && !universeId) {
            throw new Error("Either projectId or universeId must be provided");
        }
        const entityId = exportMode === "UNIVERSE" ? universeId! : projectId!;
        return GoogleDocsExporter.exportToGoogleDocs(entityId, exportMode);
    },

    // Admin
    create_project: async (a) => createProject(a as Parameters<typeof createProject>[0]),
    update_project: async (a) => {
        const { projectId, ...data } = a;
        return updateProject(projectId as string, data as Parameters<typeof updateProject>[1]);
    },
    snapshot_database: async (a) => snapshotDatabase(a.message as string),
    list_snapshots: async (a) => listDatabaseSnapshots(a.limit as number),
    restore_snapshot: async (a) => restoreDatabaseSnapshot(a.commitHash as string),
    google_auth_status: async () => GoogleAuthController.getStatus(),
    google_auth_connect: async () => ({ authUrl: GoogleAuthController.getAuthUrl() }),
    google_auth_callback: async (a) => {
        await GoogleAuthController.handleCallback(a.code as string);
        return { success: true };
    },
    google_auth_disconnect: async () => {
        await GoogleAuthController.disconnect();
        return { success: true };
    },
};

/**
 * Execute a tool by name with the given arguments.
 * Returns a JSON-stringified result on success, or a structured error response.
 */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    const handler = toolHandlers[name];

    if (!handler) {
        return JSON.stringify({
            error: true,
            message: `Unknown tool: ${name}`,
            availableTools: Object.keys(toolHandlers),
        });
    }

    try {
        const result = await handler(args);
        return JSON.stringify(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return JSON.stringify({
            error: true,
            tool: name,
            message,
        });
    }
}
