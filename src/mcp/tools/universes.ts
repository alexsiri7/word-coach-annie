import { UniversesController } from "@/lib/controllers/universes";

export async function listUniverses() {
    return UniversesController.listUniverses();
}

export async function getUniverse(id: string) {
    return UniversesController.getUniverse(id);
}

export async function createUniverse(data: { title: string; description?: string }) {
    return UniversesController.createUniverse(data);
}

export async function updateUniverse(id: string, data: { title?: string; description?: string }) {
    return UniversesController.updateUniverse(id, data);
}

export async function deleteUniverse(id: string) {
    return UniversesController.deleteUniverse(id);
}

export async function listWorldObjects(universeId: string, type?: string) {
    return UniversesController.listWorldObjects(universeId, type);
}

export async function getWorldObject(id: string) {
    return UniversesController.getWorldObject(id);
}

export async function createWorldObject(data: {
    universeId: string;
    type: string;
    name: string;
    description?: string;
    notes?: string;
    tags?: string;
}) {
    return UniversesController.createWorldObject(data);
}

export async function updateWorldObject(
    id: string,
    data: {
        name?: string;
        description?: string;
        notes?: string;
        tags?: string;
        type?: string;
    }
) {
    return UniversesController.updateWorldObject(id, data);
}

export async function deleteWorldObject(id: string) {
    return UniversesController.deleteWorldObject(id);
}

export async function addTimelineEntry(data: {
    worldObjectId: string;
    label: string;
    description?: string;
    attributes?: string;
    projectId?: string;
    orderIndex?: number;
}) {
    return UniversesController.addTimelineEntry(data);
}

export async function updateTimelineEntry(
    id: string,
    data: {
        label?: string;
        description?: string;
        attributes?: string;
        orderIndex?: number;
    }
) {
    return UniversesController.updateTimelineEntry(id, data);
}

export async function deleteTimelineEntry(id: string) {
    return UniversesController.deleteTimelineEntry(id);
}

export async function reorderTimelineEntries(worldObjectId: string, orderedIds: string[]) {
    return UniversesController.reorderTimelineEntries(worldObjectId, orderedIds);
}

export async function transferStoryObjectToUniverse(storyObjectId: string, universeId: string) {
    return UniversesController.transferStoryObjectToUniverse(storyObjectId, universeId);
}

export async function copyWorldObjectToProject(worldObjectId: string, projectId: string) {
    return UniversesController.copyWorldObjectToProject(worldObjectId, projectId);
}

export async function linkProjectToUniverse(projectId: string, universeId: string) {
    return UniversesController.linkProjectToUniverse(projectId, universeId);
}

export async function unlinkProjectFromUniverse(projectId: string) {
    return UniversesController.unlinkProjectFromUniverse(projectId);
}
