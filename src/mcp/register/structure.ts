import { mcpRun } from "@/mcp/tool-errors";
import { UserFacingError } from "@/lib/controllers/errors";
import {
    getOutline,
    createNode,
    updateNode,
    deleteNode,
    readSceneContent,
    writeSceneContent,
    writeSceneContentFromBlocks,
    updateParagraph,
    insertBeat,
    deleteBeat,
    getSceneVersions,
    restoreSceneVersion,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    resolveAnnotation,
    getOpenAnnotations,
    batchCreateNodes,
    batchUpdateNodes,
    batchDeleteNodes,
} from "@/mcp/tools/structure";
import {
    assertProjectOwner as verifyProjectOwnership,
    projectIdForAnnotation,
    projectIdForNode,
} from "@/lib/ownership";
import {
    getOutlineSpec,
    createNodeSpec,
    updateNodeSpec,
    deleteNodeSpec,
    readSceneContentSpec,
    writeSceneContentSpec,
    updateParagraphSpec,
    insertBeatSpec,
    deleteBeatSpec,
    getSceneVersionsSpec,
    restoreSceneVersionSpec,
    addAnnotationSpec,
    updateAnnotationSpec,
    deleteAnnotationSpec,
    resolveAnnotationSpec,
    getOpenAnnotationsSpec,
    batchCreateNodesSpec,
    batchUpdateNodesSpec,
    batchDeleteNodesSpec,
} from "@/lib/ai/tool-catalog/structure";
import { registerTool, type RegisterContext } from "./register-tool";

export function registerStructureTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    registerTool(ctx, getOutlineSpec, async ({ projectId }) => {
        await verifyProjectOwnership(projectId, userId);
        const result = await getOutline(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, createNodeSpec, async (params) => {
        await verifyProjectOwnership(params.projectId, userId);
        const result = await createNode(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, updateNodeSpec, async ({ nodeId, contentHash, ...data }) =>
        mcpRun("update_node", "Error updating node", async () => {
            await verifyProjectOwnership(await projectIdForNode(nodeId), userId);
            return updateNode(nodeId, data, contentHash);
        }));

    registerTool(ctx, deleteNodeSpec, async ({ nodeId }) => {
        await verifyProjectOwnership(await projectIdForNode(nodeId), userId);
        const result = await deleteNode(nodeId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, readSceneContentSpec, async ({ nodeId }) => {
        await verifyProjectOwnership(await projectIdForNode(nodeId), userId);
        const result = await readSceneContent(nodeId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, writeSceneContentSpec, async ({ nodeId, contentHash, content, blocks }) =>
        mcpRun("write_scene_content", "Error writing scene content", async () => {
            await verifyProjectOwnership(await projectIdForNode(nodeId), userId);
            if (blocks) return writeSceneContentFromBlocks(nodeId, blocks as { type: "CONTENT" | "BEAT"; content: string }[], contentHash);
            if (content !== undefined) return writeSceneContent(nodeId, content, contentHash);
            throw new UserFacingError("Either 'content' or 'blocks' must be provided");
        }));

    registerTool(ctx, updateParagraphSpec, async ({ nodeId, index, content, paragraphContentHash, sceneContentHash }) =>
        mcpRun("update_paragraph", "Error updating paragraph", async () => {
            await verifyProjectOwnership(await projectIdForNode(nodeId), userId);
            return updateParagraph(nodeId, index, content, paragraphContentHash, sceneContentHash);
        }));

    // Note: insert_beat bypasses the prose-writing guard because the payload is beat
    // text only — no CONTENT blocks are written, so the guard condition never fires.
    registerTool(ctx, insertBeatSpec, async ({ nodeId, afterParagraphIndex, beatContent, sceneContentHash }) =>
        mcpRun("insert_beat", "Error inserting beat", async () => {
            await verifyProjectOwnership(await projectIdForNode(nodeId), userId);
            return insertBeat(nodeId, afterParagraphIndex, beatContent, sceneContentHash);
        }));

    registerTool(ctx, deleteBeatSpec, async ({ nodeId, index, paragraphContentHash, sceneContentHash }) =>
        mcpRun("delete_beat", "Error deleting beat", async () => {
            await verifyProjectOwnership(await projectIdForNode(nodeId), userId);
            return deleteBeat(nodeId, index, paragraphContentHash, sceneContentHash);
        }));

    registerTool(ctx, getSceneVersionsSpec, async ({ nodeId, limit }) => {
        await verifyProjectOwnership(await projectIdForNode(nodeId), userId);
        const result = await getSceneVersions(nodeId, limit);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, restoreSceneVersionSpec, async ({ nodeId, versionId }) => {
        await verifyProjectOwnership(await projectIdForNode(nodeId), userId);
        const result = await restoreSceneVersion(nodeId, versionId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, addAnnotationSpec, async ({ nodeId, content, range, selectedText }: { nodeId: string; content: string; range?: string; selectedText?: string }) => {
        await verifyProjectOwnership(await projectIdForNode(nodeId), userId);
        const result = await addAnnotation(nodeId, content, range, selectedText);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, updateAnnotationSpec, async ({ annotationId, ...data }) => {
        await verifyProjectOwnership(await projectIdForAnnotation(annotationId), userId);
        const result = await updateAnnotation(annotationId, data);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, deleteAnnotationSpec, async ({ annotationId }) => {
        await verifyProjectOwnership(await projectIdForAnnotation(annotationId), userId);
        const result = await deleteAnnotation(annotationId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, resolveAnnotationSpec, async ({ annotationId, resolved }) => {
        await verifyProjectOwnership(await projectIdForAnnotation(annotationId), userId);
        const result = await resolveAnnotation(annotationId, resolved);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, getOpenAnnotationsSpec, async ({ projectId }) => {
        if (projectId) await verifyProjectOwnership(projectId, userId);
        const result = await getOpenAnnotations(projectId, userId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, batchCreateNodesSpec, async ({ projectId, nodes }) => {
        await verifyProjectOwnership(projectId, userId);
        const result = await batchCreateNodes(projectId, nodes);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, batchUpdateNodesSpec, async ({ updates }) => {
        const projectIds = await Promise.all(updates.map(u => projectIdForNode(u.nodeId)));
        await Promise.all([...new Set(projectIds)].map(pid => verifyProjectOwnership(pid, userId)));
        const result = await batchUpdateNodes(updates);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, batchDeleteNodesSpec, async ({ nodeIds }) => {
        const projectIds = await Promise.all(nodeIds.map(id => projectIdForNode(id)));
        await Promise.all([...new Set(projectIds)].map(pid => verifyProjectOwnership(pid, userId)));
        const result = await batchDeleteNodes(nodeIds);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
}
