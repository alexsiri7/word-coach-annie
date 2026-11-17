import { mcpRun } from "@/mcp/tool-errors";
import {
    listProviders,
    createProvider,
    updateProvider,
    deleteProvider,
    listContestSubmissions,
    createContestSubmission,
    updateContestSubmission,
    deleteContestSubmission,
    listPublicationSubmissions,
    createPublicationSubmission,
    updatePublicationSubmission,
    deletePublicationSubmission,
} from "@/mcp/tools/submissions";
import {
    assertProjectOwner as verifyProjectOwnership,
    projectIdForContestSubmission,
    projectIdForPublicationSubmission,
} from "@/lib/ownership";
import {
    listProvidersSpec,
    createProviderSpec,
    updateProviderSpec,
    deleteProviderSpec,
    listContestSubmissionsSpec,
    createContestSubmissionSpec,
    updateContestSubmissionSpec,
    deleteContestSubmissionSpec,
    listPublicationSubmissionsSpec,
    createPublicationSubmissionSpec,
    updatePublicationSubmissionSpec,
    deletePublicationSubmissionSpec,
} from "@/lib/ai/tool-catalog/submissions";
import { registerTool, type RegisterContext } from "./register-tool";

export function registerSubmissionTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    // Providers (publications/contest organizers) belong to the current user, not to
    // a project, so these tools check ownership via userId rather than verifyProjectOwnership.
    registerTool(ctx, listProvidersSpec, async () =>
        mcpRun("list_providers", "Error listing providers", () => listProviders(userId)));

    registerTool(ctx, createProviderSpec, async (params) =>
        mcpRun("create_provider", "Error creating provider", () => createProvider({ ...params, userId })));

    registerTool(ctx, updateProviderSpec, async (params) =>
        mcpRun("update_provider", "Error updating provider", () => updateProvider({ ...params, userId })));

    registerTool(ctx, deleteProviderSpec, async ({ providerId }) => {
        const result = await deleteProvider(providerId, userId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, listContestSubmissionsSpec, async (params) =>
        mcpRun("list_contest_submissions", "Error listing contest submissions", async () => {
            await verifyProjectOwnership(params.projectId, userId);
            return listContestSubmissions(params);
        }));

    registerTool(ctx, createContestSubmissionSpec, async (params) =>
        mcpRun("create_contest_submission", "Error creating contest submission", async () => {
            await verifyProjectOwnership(params.projectId, userId);
            return createContestSubmission({ ...params, userId });
        }));

    registerTool(ctx, updateContestSubmissionSpec, async ({ submissionId, ...data }) =>
        mcpRun("update_contest_submission", "Error updating contest submission", async () => {
            await verifyProjectOwnership(await projectIdForContestSubmission(submissionId), userId);
            return updateContestSubmission({ submissionId, userId, ...data });
        }));

    registerTool(ctx, deleteContestSubmissionSpec, async ({ submissionId }) => {
        await verifyProjectOwnership(await projectIdForContestSubmission(submissionId), userId);
        const result = await deleteContestSubmission(submissionId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, listPublicationSubmissionsSpec, async (params) =>
        mcpRun("list_publication_submissions", "Error listing publication submissions", async () => {
            await verifyProjectOwnership(params.projectId, userId);
            return listPublicationSubmissions(params);
        }));

    registerTool(ctx, createPublicationSubmissionSpec, async (params) =>
        mcpRun("create_publication_submission", "Error creating publication submission", async () => {
            await verifyProjectOwnership(params.projectId, userId);
            return createPublicationSubmission(params);
        }));

    registerTool(ctx, updatePublicationSubmissionSpec, async ({ submissionId, ...data }) =>
        mcpRun("update_publication_submission", "Error updating publication submission", async () => {
            await verifyProjectOwnership(await projectIdForPublicationSubmission(submissionId), userId);
            return updatePublicationSubmission({ submissionId, ...data });
        }));

    registerTool(ctx, deletePublicationSubmissionSpec, async ({ submissionId }) => {
        await verifyProjectOwnership(await projectIdForPublicationSubmission(submissionId), userId);
        const result = await deletePublicationSubmission(submissionId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
}
