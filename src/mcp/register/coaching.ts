import {
    getPlotThreadStatus,
    getSceneFocus,
    getManuscriptContext,
    getConsistencyContext,
    getVoiceContext,
    getStoryBibleCrossReference,
} from "@/mcp/tools/coaching";
import { assertProjectOwner as verifyProjectOwnership, projectIdForNode } from "@/lib/ownership";
import {
    getPlotThreadStatusSpec,
    getSceneFocusSpec,
    getManuscriptContextSpec,
    getConsistencyContextSpec,
    crossReferenceStoryBibleSpec,
    getVoiceContextSpec,
} from "@/lib/ai/tool-catalog/coaching";
import { registerTool, type RegisterContext } from "./register-tool";

export function registerCoachingTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    registerTool(ctx, getPlotThreadStatusSpec, async ({ projectId }) => {
        await verifyProjectOwnership(projectId, userId);
        const result = await getPlotThreadStatus(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, getSceneFocusSpec, async ({ sceneId }) => {
        await verifyProjectOwnership(await projectIdForNode(sceneId), userId);
        const result = await getSceneFocus(sceneId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, getManuscriptContextSpec, async ({ projectId }) => {
        await verifyProjectOwnership(projectId, userId);
        const result = await getManuscriptContext(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, getConsistencyContextSpec, async ({ projectId, sceneId }) => {
        await verifyProjectOwnership(projectId, userId);
        const result = await getConsistencyContext(projectId, sceneId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, crossReferenceStoryBibleSpec, async ({ projectId, sceneId }) => {
        await verifyProjectOwnership(projectId, userId);
        const result = await getStoryBibleCrossReference(projectId, sceneId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, getVoiceContextSpec, async ({ projectId, sceneId }) => {
        await verifyProjectOwnership(projectId, userId);
        const result = await getVoiceContext(projectId, sceneId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
}
