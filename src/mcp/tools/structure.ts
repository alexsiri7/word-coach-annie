import { StructureController, type OutlineNode } from "@/lib/controllers/structure";
import { trace } from "@opentelemetry/api";
import { mcpCache } from "@/lib/cache";
import { computeContentHash, verifyContentHash } from "@/mcp/content-hash";

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

function nodeContentHash(node: { title: string; synopsis: string; status: string }): string {
    return computeContentHash(node.title, node.synopsis, node.status);
}

function addHashesToOutline(nodes: OutlineNode[]): (OutlineNode & { contentHash: string })[] {
    return nodes.map(node => ({
        ...node,
        contentHash: nodeContentHash(node),
        children: addHashesToOutline(node.children),
    }));
}

export async function getOutline(projectId: string) {
    const nodes = await mcpCache.getOrSet(
        `outline:${projectId}`,
        () => StructureController.getOutline(projectId),
    );
    return addHashesToOutline(nodes);
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
    },
    contentHash?: string
) {
    if (contentHash !== undefined) {
        const current = await StructureController.getNode(nodeId);
        verifyContentHash(contentHash, nodeContentHash(current), "get_outline");
    }
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
    const raw = await mcpCache.getOrSet(
        `sceneContent:${nodeId}`,
        () => StructureController.readSceneContent(nodeId),
    );
    const paragraphs = raw.blocks.map((block, index) => ({
        index,
        type: block.type,
        content: block.content,
        contentHash: computeContentHash(String(index), block.type, block.content),
    }));
    return {
        ...raw,
        contentHash: computeContentHash(raw.content),
        paragraphs,
    };
}

export async function updateParagraph(
    nodeId: string,
    index: number,
    content: string,
    paragraphContentHash?: string,
    sceneContentHash?: string,
) {
    const current = await StructureController.readSceneContent(nodeId);
    if (sceneContentHash !== undefined) {
        verifyContentHash(sceneContentHash, computeContentHash(current.content), "read_scene_content");
    }
    const blocks = current.blocks;
    if (index < 0 || index >= blocks.length) {
        throw new Error(`Paragraph index ${index} out of range (0–${blocks.length - 1})`);
    }
    const block = blocks[index];
    if (paragraphContentHash !== undefined) {
        const expected = computeContentHash(String(index), block.type, block.content);
        verifyContentHash(paragraphContentHash, expected, "read_scene_content");
    }
    blocks[index] = { type: block.type, content };
    const result = await StructureController.writeSceneContentFromBlocks(nodeId, blocks);
    mcpCache.delete(`sceneContent:${nodeId}`);
    invalidateStructureCaches();
    return result;
}

export async function writeSceneContent(nodeId: string, content: string, contentHash?: string) {
    if (contentHash !== undefined) {
        const current = await StructureController.readSceneContent(nodeId);
        verifyContentHash(contentHash, computeContentHash(current.content), "read_scene_content");
    }
    const result = await StructureController.writeSceneContent(nodeId, content);
    mcpCache.delete(`sceneContent:${nodeId}`);
    invalidateStructureCaches();
    return result;
}

export async function writeSceneContentFromBlocks(
    nodeId: string,
    blocks: { type: "CONTENT" | "BEAT"; content: string }[],
    contentHash?: string
) {
    if (contentHash !== undefined) {
        const current = await StructureController.readSceneContent(nodeId);
        verifyContentHash(contentHash, computeContentHash(current.content), "read_scene_content");
    }
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

export async function batchCreateNodes(
    projectId: string,
    nodes: Array<{
        type: string;
        title: string;
        parentId?: string;
        synopsis?: string;
        status?: string;
    }>
) {
    const span = trace.getActiveSpan();
    span?.setAttribute("batch.size", nodes.length);
    span?.setAttribute("batch.operation", "create_nodes");
    const result = await StructureController.batchCreateNodes(projectId, nodes);
    span?.setAttribute("batch.total_created", result.totalCreated ?? 0);
    span?.setAttribute("batch.total_errors", result.totalErrors ?? 0);
    invalidateStructureCaches(projectId);
    return result;
}

export async function batchUpdateNodes(
    updates: Array<{
        nodeId: string;
        title?: string;
        synopsis?: string;
        status?: string;
        orderIndex?: number;
        parentId?: string | null;
    }>
) {
    const span = trace.getActiveSpan();
    span?.setAttribute("batch.size", updates.length);
    span?.setAttribute("batch.operation", "update_nodes");
    const result = await StructureController.batchUpdateNodes(updates);
    span?.setAttribute("batch.total_updated", result.totalUpdated ?? 0);
    span?.setAttribute("batch.total_errors", result.totalErrors ?? 0);
    invalidateStructureCaches();
    return result;
}

export async function batchDeleteNodes(nodeIds: string[]) {
    const span = trace.getActiveSpan();
    span?.setAttribute("batch.size", nodeIds.length);
    span?.setAttribute("batch.operation", "delete_nodes");
    const result = await StructureController.batchDeleteNodes(nodeIds);
    span?.setAttribute("batch.total_deleted", result.totalDeleted ?? 0);
    span?.setAttribute("batch.total_errors", result.totalErrors ?? 0);
    invalidateStructureCaches();
    return result;
}

export async function getOpenAnnotations(projectId?: string) {
    return StructureController.getOpenAnnotations(projectId);
}
