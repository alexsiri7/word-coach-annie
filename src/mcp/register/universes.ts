import { mcpRun } from "@/mcp/tool-errors";
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
import {
    assertProjectOwner as verifyProjectOwnership,
    assertUniverseOwner as verifyUniverseOwnership,
    projectIdForStoryObject,
    universeIdForWorldObject,
    universeIdForTimelineEntry,
} from "@/lib/ownership";
import {
    listUniversesSpec,
    getUniverseSpec,
    createUniverseSpec,
    updateUniverseSpec,
    deleteUniverseSpec,
    listWorldObjectsSpec,
    getWorldObjectSpec,
    createWorldObjectSpec,
    updateWorldObjectSpec,
    deleteWorldObjectSpec,
    addTimelineEntrySpec,
    updateTimelineEntrySpec,
    deleteTimelineEntrySpec,
    reorderTimelineEntriesSpec,
    transferStoryObjectToUniverseSpec,
    linkProjectToUniverseSpec,
    unlinkProjectFromUniverseSpec,
} from "@/lib/ai/tool-catalog/universes";
import { registerTool, type RegisterContext } from "./register-tool";

export function registerUniverseTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    registerTool(ctx, listUniversesSpec, async () => {
        const result = await listUniverses(userId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, getUniverseSpec, async ({ universeId }) => {
        await verifyUniverseOwnership(universeId, userId);
        const result = await getUniverse(universeId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, createUniverseSpec, async (params) => {
        const result = await createUniverse(params, userId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, updateUniverseSpec, async ({ universeId, contentHash, ...data }) =>
        mcpRun("update_universe", "Error updating universe", async () => {
            await verifyUniverseOwnership(universeId, userId);
            return updateUniverse(universeId, data, contentHash);
        }));

    registerTool(ctx, deleteUniverseSpec, async ({ universeId }) => {
        await verifyUniverseOwnership(universeId, userId);
        const result = await deleteUniverse(universeId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, listWorldObjectsSpec, async ({ universeId, type }) => {
        await verifyUniverseOwnership(universeId, userId);
        const result = await listWorldObjects(universeId, type);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, getWorldObjectSpec, async ({ objectId }) => {
        await verifyUniverseOwnership(await universeIdForWorldObject(objectId), userId);
        const result = await getWorldObject(objectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, createWorldObjectSpec, async (params) => {
        await verifyUniverseOwnership(params.universeId, userId);
        const result = await createWorldObject(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, updateWorldObjectSpec, async ({ objectId, contentHash, ...data }) =>
        mcpRun("update_world_object", "Error updating world object", async () => {
            await verifyUniverseOwnership(await universeIdForWorldObject(objectId), userId);
            return updateWorldObject(objectId, data, contentHash);
        }));

    registerTool(ctx, deleteWorldObjectSpec, async ({ objectId }) => {
        await verifyUniverseOwnership(await universeIdForWorldObject(objectId), userId);
        const result = await deleteWorldObject(objectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, addTimelineEntrySpec, async (params) => {
        await verifyUniverseOwnership(await universeIdForWorldObject(params.worldObjectId), userId);
        if (params.projectId) await verifyProjectOwnership(params.projectId, userId);
        const result = await addTimelineEntry(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, updateTimelineEntrySpec, async ({ entryId, contentHash, ...data }) =>
        mcpRun("update_timeline_entry", "Error updating timeline entry", async () => {
            await verifyUniverseOwnership(await universeIdForTimelineEntry(entryId), userId);
            return updateTimelineEntry(entryId, data, contentHash);
        }));

    registerTool(ctx, deleteTimelineEntrySpec, async ({ entryId }) => {
        await verifyUniverseOwnership(await universeIdForTimelineEntry(entryId), userId);
        const result = await deleteTimelineEntry(entryId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, reorderTimelineEntriesSpec, async ({ worldObjectId, orderedIds }: { worldObjectId: string; orderedIds: string[] }) => {
        await verifyUniverseOwnership(await universeIdForWorldObject(worldObjectId), userId);
        const result = await reorderTimelineEntries(worldObjectId, orderedIds);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, transferStoryObjectToUniverseSpec, async ({ storyObjectId, universeId }: { storyObjectId: string; universeId: string }) => {
        await verifyProjectOwnership(await projectIdForStoryObject(storyObjectId), userId);
        await verifyUniverseOwnership(universeId, userId);
        const result = await transferStoryObjectToUniverse(storyObjectId, universeId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, linkProjectToUniverseSpec, async ({ projectId, universeId }) => {
        await verifyProjectOwnership(projectId, userId);
        await verifyUniverseOwnership(universeId, userId);
        const result = await linkProjectToUniverse(projectId, universeId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, unlinkProjectFromUniverseSpec, async ({ projectId }) => {
        await verifyProjectOwnership(projectId, userId);
        const result = await unlinkProjectFromUniverse(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
}
