import { StructureController } from "@/lib/controllers/structure";
import { mcpCache } from "@/lib/cache";

/** Invalidate caches affected by structure/content changes. */
function invalidateStructureCaches(projectId?: string) {
    if (projectId) {
        mcpCache.delete(`outline:${projectId}`);
        mcpCache.delete(`projectSummary:${projectId}`);
    } else {
        mcpCache.invalidatePrefix("outline:");
        mcpCache.invalidatePrefix("projectSummary:");
    }
    mcpCache.invalidatePrefix("projects:");
}

export async function getOutline(projectId: string) {
    return mcpCache.getOrSet(
        `outline:${projectId}`,
        () => StructureController.getOutline(projectId),
    );
}

export async function createNode(params: {
    projectId: string;
    type: string;
    title: string;
    parentId?: string;
    synopsis?: string;
    status?: string;
    insertAfterIndex?: number;
}) {
    const result = await StructureController.createNode(params);
    invalidateStructureCaches(params.projectId);
    return result;
}

export async function updateNode(
    nodeId: string,
    data: {
        title?: string;
        synopsis?: string;
        status?: string;
        orderIndex?: number;
        parentId?: string | null;
    }
) {
    const result = await StructureController.updateNode(nodeId, data);
    invalidateStructureCaches();
    return result;
}

export async function deleteNode(nodeId: string) {
    const result = await StructureController.deleteNode(nodeId);
    invalidateStructureCaches();
    return result;
}

export async function readSceneContent(nodeId: string) {
    return mcpCache.getOrSet(
        `sceneContent:${nodeId}`,
        () => StructureController.readSceneContent(nodeId),
    );
}

export async function writeSceneContent(nodeId: string, content: string) {
    const result = await StructureController.writeSceneContent(nodeId, content);
    mcpCache.delete(`sceneContent:${nodeId}`);
    invalidateStructureCaches();
    return result;
}

export async function writeSceneContentFromBlocks(nodeId: string, blocks: { type: "CONTENT" | "BEAT"; content: string }[]) {
    const result = await StructureController.writeSceneContentFromBlocks(nodeId, blocks);
    mcpCache.delete(`sceneContent:${nodeId}`);
    invalidateStructureCaches();
    return result;
}

export async function getSceneVersions(nodeId: string, limit: number = 20) {
    return StructureController.getSceneVersions(nodeId, limit);
}

export async function restoreSceneVersion(nodeId: string, versionId: string) {
    const result = await StructureController.restoreSceneVersion(nodeId, versionId);
    mcpCache.delete(`sceneContent:${nodeId}`);
    invalidateStructureCaches();
    return result;
}

export async function addAnnotation(nodeId: string, content: string, range: string = "", selectedText: string | null = null) {
    const result = await StructureController.addAnnotation(nodeId, content, range, selectedText);
    mcpCache.delete(`sceneContent:${nodeId}`);
    return result;
}

export async function updateAnnotation(annotationId: string, data: { content?: string; resolved?: boolean }) {
    return StructureController.updateAnnotation(annotationId, data);
}

export async function deleteAnnotation(annotationId: string) {
    return StructureController.deleteAnnotation(annotationId);
}

export async function resolveAnnotation(annotationId: string, resolved: boolean) {
    return StructureController.resolveAnnotation(annotationId, resolved);
}

export async function getOpenAnnotations(projectId?: string) {
    return StructureController.getOpenAnnotations(projectId);
}
