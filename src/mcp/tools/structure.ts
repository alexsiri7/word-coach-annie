import { StructureController } from "@/lib/controllers/structure";

export async function getOutline(projectId: string) {
    return StructureController.getOutline(projectId);
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
    return StructureController.createNode(params);
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
    return StructureController.updateNode(nodeId, data);
}

export async function deleteNode(nodeId: string) {
    return StructureController.deleteNode(nodeId);
}

export async function readSceneContent(nodeId: string) {
    return StructureController.readSceneContent(nodeId);
}

export async function writeSceneContent(nodeId: string, content: string) {
    return StructureController.writeSceneContent(nodeId, content);
}

export async function getSceneVersions(nodeId: string, limit: number = 20) {
    return StructureController.getSceneVersions(nodeId, limit);
}

export async function restoreSceneVersion(nodeId: string, versionId: string) {
    return StructureController.restoreSceneVersion(nodeId, versionId);
}

export async function resolveAnnotation(annotationId: string, resolved: boolean) {
    return StructureController.resolveAnnotation(annotationId, resolved);
}

export async function getOpenAnnotations(projectId?: string) {
    return StructureController.getOpenAnnotations(projectId);
}
