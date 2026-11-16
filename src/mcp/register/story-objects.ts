import { mcpRun } from "@/mcp/tool-errors";
import {
    listStoryObjects,
    getStoryObject,
    createStoryObject,
    updateStoryObject,
    deleteStoryObject,
    batchCreateStoryObjects,
    batchUpdateStoryObjects,
    batchDeleteStoryObjects,
} from "@/mcp/tools/story-objects";
import { assertProjectOwner as verifyProjectOwnership, projectIdForStoryObject } from "@/lib/ownership";
import {
    listStoryObjectsSpec,
    getStoryObjectSpec,
    createStoryObjectSpec,
    updateStoryObjectSpec,
    deleteStoryObjectSpec,
    batchCreateStoryObjectsSpec,
    batchUpdateStoryObjectsSpec,
    batchDeleteStoryObjectsSpec,
} from "@/lib/ai/tool-catalog/story-objects";
import { registerTool, type RegisterContext } from "./register-tool";

export function registerStoryObjectTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    registerTool(ctx, listStoryObjectsSpec, async (params) => {
        await verifyProjectOwnership(params.projectId, userId);
        const result = await listStoryObjects(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, getStoryObjectSpec, async ({ objectId }: { objectId: string }) => {
        await verifyProjectOwnership(await projectIdForStoryObject(objectId), userId);
        const result = await getStoryObject(objectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, createStoryObjectSpec, async (params) => {
        await verifyProjectOwnership(params.projectId, userId);
        const result = await createStoryObject(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, updateStoryObjectSpec, async ({ objectId, contentHash, ...data }) =>
        mcpRun("update_story_object", "Error updating story object", async () => {
            await verifyProjectOwnership(await projectIdForStoryObject(objectId), userId);
            return updateStoryObject(objectId, data, contentHash);
        }));

    registerTool(ctx, deleteStoryObjectSpec, async ({ objectId }) => {
        await verifyProjectOwnership(await projectIdForStoryObject(objectId), userId);
        const result = await deleteStoryObject(objectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, batchCreateStoryObjectsSpec, async ({ projectId, objects }) => {
        await verifyProjectOwnership(projectId, userId);
        const result = await batchCreateStoryObjects(projectId, objects);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, batchUpdateStoryObjectsSpec, async ({ updates }) => {
        const projectIds = await Promise.all(updates.map(u => projectIdForStoryObject(u.objectId)));
        await Promise.all([...new Set(projectIds)].map(pid => verifyProjectOwnership(pid, userId)));
        const result = await batchUpdateStoryObjects(updates);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, batchDeleteStoryObjectsSpec, async ({ objectIds }) => {
        const projectIds = await Promise.all(objectIds.map(id => projectIdForStoryObject(id)));
        await Promise.all([...new Set(projectIds)].map(pid => verifyProjectOwnership(pid, userId)));
        const result = await batchDeleteStoryObjects(objectIds);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
}
