import {
    ProviderController,
    ContestSubmissionController,
    PublicationSubmissionController,
} from "@/lib/controllers/submissions";
import { mcpCache } from "@/lib/cache";

// ── Providers (user-scoped) ─────────────────────────────────────────────
// Providers have a nullable-but-real FK to User. When the MCP server runs without
// multi-user auth (userId is null), pass null straight through rather than
// substituting a placeholder id — this mirrors tools/projects.ts (listProjects,
// createProject) and keeps `where: { userId: null }` / `data: { userId: null }`
// consistent between single-user rows and single-user callers.

export async function listProviders(userId: string | null) {
    const key = `providers:${userId}`;
    return mcpCache.getOrSet(key, () => ProviderController.listProviders(userId));
}

export async function createProvider(params: {
    userId: string | null;
    name: string;
    website?: string;
    notes?: string;
}) {
    const result = await ProviderController.createProvider(params);
    mcpCache.invalidatePrefix(`providers:${params.userId}`);
    return result;
}

export async function updateProvider(params: {
    providerId: string;
    userId: string | null;
    name?: string;
    website?: string;
    notes?: string;
}) {
    const { providerId, userId, ...data } = params;
    if (Object.keys(data).length === 0) {
        throw new Error("No fields provided to update — at least one optional field must be supplied.");
    }
    const result = await ProviderController.updateProvider(providerId, userId, data);
    mcpCache.invalidatePrefix(`providers:${userId}`);
    return result;
}

export async function deleteProvider(providerId: string, userId: string | null) {
    const result = await ProviderController.deleteProvider(providerId, userId);
    mcpCache.invalidatePrefix(`providers:${userId}`);
    return result;
}

// ── Contest Submissions (project-scoped) ────────────────────────────────

export async function listContestSubmissions(params: { projectId: string }) {
    const key = `contestSubmissions:${params.projectId}`;
    return mcpCache.getOrSet(key, () => ContestSubmissionController.listContestSubmissions(params));
}

export async function createContestSubmission(params: {
    projectId: string;
    providerId: string;
    contestName: string;
    submissionDate: string;
    reviewDate?: string;
    submissionUrl?: string;
    status?: string;
}) {
    const result = await ContestSubmissionController.createContestSubmission(params);
    mcpCache.invalidatePrefix(`contestSubmissions:${params.projectId}`);
    return result;
}

export async function updateContestSubmission(params: {
    submissionId: string;
    providerId?: string;
    contestName?: string;
    submissionDate?: string;
    reviewDate?: string;
    submissionUrl?: string;
    status?: string;
}) {
    const { submissionId, ...data } = params;
    if (Object.keys(data).length === 0) {
        throw new Error("No fields provided to update — at least one optional field must be supplied.");
    }
    const result = await ContestSubmissionController.updateContestSubmission(submissionId, data);
    mcpCache.invalidatePrefix(`contestSubmissions:${result.projectId}`);
    return result;
}

export async function deleteContestSubmission(submissionId: string) {
    const result = await ContestSubmissionController.deleteContestSubmission(submissionId);
    mcpCache.invalidatePrefix("contestSubmissions:");
    return result;
}

// ── Publication Submissions (project-scoped) ────────────────────────────

export async function listPublicationSubmissions(params: { projectId: string }) {
    const key = `publicationSubmissions:${params.projectId}`;
    return mcpCache.getOrSet(key, () => PublicationSubmissionController.listPublicationSubmissions(params));
}

export async function createPublicationSubmission(params: {
    projectId: string;
    venueName: string;
    submissionDate: string;
    status?: string;
}) {
    const result = await PublicationSubmissionController.createPublicationSubmission(params);
    mcpCache.invalidatePrefix(`publicationSubmissions:${params.projectId}`);
    return result;
}

export async function updatePublicationSubmission(params: {
    submissionId: string;
    venueName?: string;
    submissionDate?: string;
    status?: string;
}) {
    const { submissionId, ...data } = params;
    if (Object.keys(data).length === 0) {
        throw new Error("No fields provided to update — at least one optional field must be supplied.");
    }
    const result = await PublicationSubmissionController.updatePublicationSubmission(submissionId, data);
    mcpCache.invalidatePrefix(`publicationSubmissions:${result.projectId}`);
    return result;
}

export async function deletePublicationSubmission(submissionId: string) {
    const result = await PublicationSubmissionController.deletePublicationSubmission(submissionId);
    mcpCache.invalidatePrefix("publicationSubmissions:");
    return result;
}
