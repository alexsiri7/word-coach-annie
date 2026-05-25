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

type FlatParagraph = {
    globalIndex: number;
    blockIndex: number;
    positionWithinBlock: number;
    type: "CONTENT" | "BEAT";
    content: string;
};

const P_TAG_RE = /<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi;

function flattenBlocksToParagraphs(
    blocks: { type: "CONTENT" | "BEAT"; content: string }[],
): FlatParagraph[] {
    const result: FlatParagraph[] = [];
    let globalIndex = 0;
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
        const block = blocks[blockIndex];
        if (block.type === "BEAT") {
            result.push({ globalIndex, blockIndex, positionWithinBlock: 0, type: "BEAT", content: block.content });
            globalIndex++;
        } else {
            const matches = block.content.match(P_TAG_RE);
            if (!matches || matches.length === 0) {
                result.push({ globalIndex, blockIndex, positionWithinBlock: 0, type: "CONTENT", content: block.content });
                globalIndex++;
            } else {
                for (let i = 0; i < matches.length; i++) {
                    result.push({ globalIndex, blockIndex, positionWithinBlock: i, type: "CONTENT", content: matches[i] });
                    globalIndex++;
                }
            }
        }
    }
    return result;
}

function splitAtParagraph(blockContent: string, afterNthParagraph: number): [string, string] {
    let count = 0;
    const re = /<\/p>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(blockContent)) !== null) {
        count++;
        if (count === afterNthParagraph + 1) {
            const splitPos = match.index + match[0].length;
            return [blockContent.slice(0, splitPos), blockContent.slice(splitPos)];
        }
    }
    return [blockContent, ""];
}

export async function readSceneContent(nodeId: string) {
    const raw = await mcpCache.getOrSet(
        `sceneContent:${nodeId}`,
        () => StructureController.readSceneContent(nodeId),
    );
    const flat = flattenBlocksToParagraphs(raw.blocks);
    const paragraphs = flat.map((entry) => ({
        index: entry.globalIndex,
        type: entry.type,
        content: entry.content,
        contentHash: computeContentHash(String(entry.globalIndex), entry.type, entry.content),
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
    const flat = flattenBlocksToParagraphs(blocks);
    if (index < 0 || index >= flat.length) {
        throw new Error(`Paragraph index ${index} out of range (0–${flat.length - 1})`);
    }
    const entry = flat[index];
    if (paragraphContentHash !== undefined) {
        const expected = computeContentHash(String(index), entry.type, entry.content);
        verifyContentHash(paragraphContentHash, expected, "read_scene_content");
    }
    if (entry.type === "BEAT") {
        blocks[entry.blockIndex] = { type: "BEAT", content };
    } else {
        const blockContent = blocks[entry.blockIndex].content;
        const matches = blockContent.match(P_TAG_RE);
        if (!matches || matches.length <= 1) {
            blocks[entry.blockIndex] = { type: "CONTENT", content };
        } else {
            matches[entry.positionWithinBlock] = content;
            blocks[entry.blockIndex] = { type: "CONTENT", content: matches.join("") };
        }
    }
    const result = await StructureController.writeSceneContentFromBlocks(nodeId, blocks);
    mcpCache.delete(`sceneContent:${nodeId}`);
    invalidateStructureCaches();
    return result;
}

export async function insertBeat(
    nodeId: string,
    afterParagraphIndex: number,
    beatContent: string,
    sceneContentHash?: string,
) {
    const current = await StructureController.readSceneContent(nodeId);
    if (sceneContentHash !== undefined) {
        verifyContentHash(sceneContentHash, computeContentHash(current.content), "read_scene_content");
    }
    const blocks = current.blocks;
    const flat = flattenBlocksToParagraphs(blocks);
    const totalParagraphs = flat.length;
    // afterParagraphIndex of -1 means "insert at the very beginning"
    if (afterParagraphIndex < -1 || afterParagraphIndex >= totalParagraphs) {
        throw new Error(
            `afterParagraphIndex ${afterParagraphIndex} out of range (-1–${totalParagraphs - 1})`
        );
    }
    if (afterParagraphIndex === -1) {
        blocks.splice(0, 0, { type: "BEAT", content: beatContent });
    } else {
        const entry = flat[afterParagraphIndex];
        // Count how many <p> tags are in this block
        const blockContent = blocks[entry.blockIndex].content;
        const matches = blockContent.match(P_TAG_RE);
        const isLastPInBlock = entry.type === "BEAT" || !matches || entry.positionWithinBlock === matches.length - 1;

        if (isLastPInBlock) {
            // Insert beat after this block (no split needed)
            blocks.splice(entry.blockIndex + 1, 0, { type: "BEAT", content: beatContent });
        } else {
            // Split the CONTENT block at the paragraph boundary
            const [left, right] = splitAtParagraph(blockContent, entry.positionWithinBlock);
            const replacement: { type: "CONTENT" | "BEAT"; content: string }[] = [
                { type: "CONTENT", content: left },
                { type: "BEAT", content: beatContent },
            ];
            if (right.trim() !== "") {
                replacement.push({ type: "CONTENT", content: right });
            }
            blocks.splice(entry.blockIndex, 1, ...replacement);
        }
    }
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
