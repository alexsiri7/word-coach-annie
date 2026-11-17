import { mcpRun } from "@/mcp/tool-errors";
import {
    listOpportunities,
    getOpportunity,
    createOpportunity,
    updateOpportunity,
    deleteOpportunity,
    listOpportunityCandidates,
    createOpportunityCandidate,
    updateOpportunityCandidate,
    deleteOpportunityCandidate,
    promoteOpportunityCandidate,
} from "@/mcp/tools/opportunities";
import {
    listOpportunitiesSpec,
    getOpportunitySpec,
    createOpportunitySpec,
    updateOpportunitySpec,
    deleteOpportunitySpec,
    listOpportunityCandidatesSpec,
    createOpportunityCandidateSpec,
    updateOpportunityCandidateSpec,
    deleteOpportunityCandidateSpec,
    promoteOpportunityCandidateSpec,
} from "@/lib/ai/tool-catalog/opportunities";
import { registerTool, type RegisterContext } from "./register-tool";

export function registerOpportunityTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    // Opportunities (contests and calls for submission you are considering) belong to
    // the current user, like providers, so ownership is checked via userId.
    registerTool(ctx, listOpportunitiesSpec, async (filters) =>
        mcpRun("list_opportunities", "Error listing opportunities", () => listOpportunities(userId, filters)));

    registerTool(ctx, getOpportunitySpec, async ({ opportunityId }) =>
        mcpRun("get_opportunity", "Error getting opportunity", () => getOpportunity(opportunityId, userId)));

    registerTool(ctx, createOpportunitySpec, async (params) =>
        mcpRun("create_opportunity", "Error creating opportunity", () => createOpportunity({ ...params, userId })));

    registerTool(ctx, updateOpportunitySpec, async (params) =>
        mcpRun("update_opportunity", "Error updating opportunity", () => updateOpportunity({ ...params, userId })));

    registerTool(ctx, deleteOpportunitySpec, async ({ opportunityId }) => {
        const result = await deleteOpportunity(opportunityId, userId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    // A candidate links a project to an opportunity: the piece you are considering
    // entering. Ownership follows the opportunity and the project it points at.
    registerTool(ctx, listOpportunityCandidatesSpec, async ({ opportunityId }) =>
        mcpRun("list_opportunity_candidates", "Error listing opportunity candidates", () =>
            listOpportunityCandidates(opportunityId, userId)
        ));

    registerTool(ctx, createOpportunityCandidateSpec, async (params) =>
        mcpRun("create_opportunity_candidate", "Error creating opportunity candidate", () =>
            createOpportunityCandidate({ ...params, userId })
        ));

    registerTool(ctx, updateOpportunityCandidateSpec, async (params) =>
        mcpRun("update_opportunity_candidate", "Error updating opportunity candidate", () =>
            updateOpportunityCandidate({ ...params, userId })
        ));

    registerTool(ctx, deleteOpportunityCandidateSpec, async ({ candidateId }) => {
        const result = await deleteOpportunityCandidate(candidateId, userId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, promoteOpportunityCandidateSpec, async ({ candidateId }) =>
        mcpRun("promote_opportunity_candidate", "Error promoting opportunity candidate", () =>
            promoteOpportunityCandidate(candidateId, userId)
        ));
}
