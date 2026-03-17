import { StoryObjectController } from "@/lib/controllers/story-objects";
import { mcpCache } from "@/lib/cache";

function storyObjectsKey(params: { projectId: string; type?: string; search?: string; limit?: number; offset?: number }): string {
    return `storyObjects:${params.projectId}:${params.type ?? ""}:${params.search ?? ""}:${params.limit ?? 50}:${params.offset ?? 0}`;
}

export async function listStoryObjects(params: {
    projectId: string;
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
}) {
    return mcpCache.getOrSet(
        storyObjectsKey(params),
        () => StoryObjectController.listStoryObjects(params),
    );
}

export async function getStoryObject(objectId: string) {
    return mcpCache.getOrSet(
        `storyObject:${objectId}`,
        () => StoryObjectController.getStoryObject(objectId),
    );
}

export async function createStoryObject(params: {
    projectId: string;
    type: string;
    name: string;
    description?: string;
    notes?: string;
    role?: string;
    tags?: string;
}) {
    const result = await StoryObjectController.createStoryObject(params);
    mcpCache.invalidatePrefix(`storyObjects:${params.projectId}:`);
    mcpCache.invalidatePrefix("projects:");
    mcpCache.delete(`projectSummary:${params.projectId}`);
    return result;
}

export async function updateStoryObject(
    objectId: string,
    data: {
        name?: string;
        description?: string;
        notes?: string;
        role?: string | null;
        tags?: string;
    }
) {
    const result = await StoryObjectController.updateStoryObject(objectId, data);
    mcpCache.delete(`storyObject:${objectId}`);
    mcpCache.invalidatePrefix("storyObjects:");
    return result;
}

export async function deleteStoryObject(objectId: string) {
    const result = await StoryObjectController.deleteStoryObject(objectId);
    mcpCache.delete(`storyObject:${objectId}`);
    mcpCache.invalidatePrefix("storyObjects:");
    mcpCache.invalidatePrefix("projects:");
    mcpCache.invalidatePrefix("projectSummary:");
    mcpCache.invalidatePrefix("relationships:");
    return result;
}

export async function batchCreateStoryObjects(
    projectId: string,
    objects: Array<{
        type: string;
        name: string;
        description?: string;
        notes?: string;
        role?: string;
        tags?: string;
    }>
) {
    const result = await StoryObjectController.batchCreateStoryObjects(projectId, objects);
    mcpCache.invalidatePrefix(`storyObjects:${projectId}:`);
    mcpCache.invalidatePrefix("projects:");
    mcpCache.delete(`projectSummary:${projectId}`);
    return result;
}

export async function batchUpdateStoryObjects(
    updates: Array<{
        objectId: string;
        name?: string;
        description?: string;
        notes?: string;
        role?: string | null;
        tags?: string;
    }>
) {
    const result = await StoryObjectController.batchUpdateStoryObjects(updates);
    mcpCache.invalidatePrefix("storyObjects:");
    for (const u of updates) {
        mcpCache.delete(`storyObject:${u.objectId}`);
    }
    return result;
}

export async function batchDeleteStoryObjects(objectIds: string[]) {
    const result = await StoryObjectController.batchDeleteStoryObjects(objectIds);
    mcpCache.invalidatePrefix("storyObjects:");
    mcpCache.invalidatePrefix("projects:");
    mcpCache.invalidatePrefix("projectSummary:");
    mcpCache.invalidatePrefix("relationships:");
    for (const id of objectIds) {
        mcpCache.delete(`storyObject:${id}`);
    }
    return result;
}
