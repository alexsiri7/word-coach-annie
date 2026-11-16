import { listRelationships, createRelationship, deleteRelationship } from "@/mcp/tools/relationships";
import { assertProjectOwner as verifyProjectOwnership, assertRelationshipOwner } from "@/lib/ownership";
import {
    listRelationshipsSpec,
    createRelationshipSpec,
    deleteRelationshipSpec,
} from "@/lib/ai/tool-catalog/relationships";
import { registerTool, type RegisterContext } from "./register-tool";

export function registerRelationshipTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    registerTool(ctx, listRelationshipsSpec, async ({ projectId }) => {
        await verifyProjectOwnership(projectId, userId);
        const result = await listRelationships(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, createRelationshipSpec, async (params) => {
        await verifyProjectOwnership(params.projectId, userId);
        const result = await createRelationship(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, deleteRelationshipSpec, async ({ relationshipId }) => {
        await assertRelationshipOwner(relationshipId, userId);
        const result = await deleteRelationship(relationshipId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
}
