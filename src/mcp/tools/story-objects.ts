import { StoryObjectController } from "@/lib/controllers/story-objects";

export async function listStoryObjects(params: {
    projectId: string;
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
}) {
    return StoryObjectController.listStoryObjects(params);
}

export async function getStoryObject(objectId: string) {
    return StoryObjectController.getStoryObject(objectId);
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
    return StoryObjectController.createStoryObject(params);
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
    return StoryObjectController.updateStoryObject(objectId, data);
}

export async function deleteStoryObject(objectId: string) {
    return StoryObjectController.deleteStoryObject(objectId);
}
