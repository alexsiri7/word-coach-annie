import { UniversesController } from "@/lib/controllers/universes";
import { computeContentHash, verifyContentHash } from "@/mcp/content-hash";

function universeContentHash(u: { title: string; description?: string | null }): string {
    return computeContentHash(u.title, u.description);
}

function worldObjectContentHash(wo: {
    name: string;
    description?: string | null;
    notes?: string | null;
    tags?: string | null;
    type: string;
}): string {
    return computeContentHash(wo.name, wo.description, wo.notes, wo.tags, wo.type);
}

function timelineEntryContentHash(entry: {
    label: string;
    description?: string | null;
    attributes?: string | null;
}): string {
    return computeContentHash(entry.label, entry.description, entry.attributes);
}

export async function listUniverses() {
    return UniversesController.listUniverses();
}

export async function getUniverse(id: string) {
    const raw = await UniversesController.getUniverse(id);
    return {
        ...raw,
        contentHash: universeContentHash(raw),
    };
}

export async function createUniverse(data: { title: string; description?: string }) {
    return UniversesController.createUniverse(data);
}

export async function updateUniverse(id: string, data: { title?: string; description?: string }, contentHash?: string) {
    if (contentHash !== undefined) {
        const current = await UniversesController.getUniverse(id);
        verifyContentHash(contentHash, universeContentHash(current), "get_universe");
    }
    return UniversesController.updateUniverse(id, data);
}

export async function deleteUniverse(id: string) {
    return UniversesController.deleteUniverse(id);
}

export async function listWorldObjects(universeId: string, type?: string) {
    return UniversesController.listWorldObjects(universeId, type);
}

export async function getWorldObject(id: string) {
    const raw = await UniversesController.getWorldObject(id);
    return {
        ...raw,
        contentHash: worldObjectContentHash(raw),
        timeline: raw.timeline.map((entry: { id: string; label: string; description: string; attributes: string; orderIndex: number; projectId: string | null; createdAt: string; updatedAt: string }) => ({
            ...entry,
            contentHash: timelineEntryContentHash(entry),
        })),
    };
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
    },
    contentHash?: string
) {
    if (contentHash !== undefined) {
        const current = await UniversesController.getWorldObject(id);
        verifyContentHash(contentHash, worldObjectContentHash(current), "get_world_object");
    }
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
    },
    contentHash?: string
) {
    if (contentHash !== undefined) {
        const current = await UniversesController.getTimelineEntry(id);
        verifyContentHash(contentHash, timelineEntryContentHash(current), "get_world_object");
    }
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

export async function linkProjectToUniverse(projectId: string, universeId: string) {
    return UniversesController.linkProjectToUniverse(projectId, universeId);
}

export async function unlinkProjectFromUniverse(projectId: string) {
    return UniversesController.unlinkProjectFromUniverse(projectId);
}
