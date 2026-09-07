import { OpportunityController, OpportunityCandidateController } from "@/lib/controllers/opportunities";
import type { CandidateStateValue, OpportunityStatusValue } from "@/schemas/opportunities";
import { mcpCache } from "@/lib/cache";

// ── Opportunities (user-scoped) ─────────────────────────────────────────
// Like providers, opportunities belong to the current user rather than to a
// project, so a null userId (single-user mode) is passed straight through.

export async function listOpportunities(userId: string | null) {
    const key = `opportunities:${userId}`;
    return mcpCache.getOrSet(key, () => OpportunityController.listOpportunities(userId));
}

export async function createOpportunity(params: {
    userId: string | null;
    providerId: string;
    title: string;
    closeDate: string;
    reviewDate?: string;
    rulesUrl?: string;
    entryFee?: string;
    wordLimit?: number;
    lineLimit?: number;
    genreRestrictions?: string;
    eligibilityNotes?: string;
    status?: OpportunityStatusValue;
}) {
    const result = await OpportunityController.createOpportunity(params);
    mcpCache.invalidatePrefix(`opportunities:${params.userId}`);
    return result;
}

export async function updateOpportunity(params: {
    opportunityId: string;
    userId: string | null;
    providerId?: string;
    title?: string;
    closeDate?: string;
    reviewDate?: string | null;
    rulesUrl?: string | null;
    entryFee?: string | null;
    wordLimit?: number | null;
    lineLimit?: number | null;
    genreRestrictions?: string | null;
    eligibilityNotes?: string | null;
    status?: OpportunityStatusValue;
}) {
    const { opportunityId, userId, ...data } = params;
    if (Object.keys(data).length === 0) {
        throw new Error("No fields provided to update — at least one optional field must be supplied.");
    }
    const result = await OpportunityController.updateOpportunity(opportunityId, userId, data);
    mcpCache.invalidatePrefix(`opportunities:${userId}`);
    return result;
}

export async function deleteOpportunity(opportunityId: string, userId: string | null) {
    const result = await OpportunityController.deleteOpportunity(opportunityId, userId);
    mcpCache.invalidatePrefix(`opportunities:${userId}`);
    mcpCache.invalidatePrefix(`opportunityCandidates:${opportunityId}`);
    return result;
}

// ── Opportunity candidates ──────────────────────────────────────────────

export async function listOpportunityCandidates(opportunityId: string, userId: string | null) {
    const key = `opportunityCandidates:${opportunityId}`;
    return mcpCache.getOrSet(key, () =>
        OpportunityCandidateController.listCandidates(opportunityId, userId)
    );
}

export async function createOpportunityCandidate(params: {
    opportunityId: string;
    userId: string | null;
    projectId: string;
    state?: CandidateStateValue;
    notes?: string;
}) {
    const result = await OpportunityCandidateController.createCandidate(params);
    mcpCache.invalidatePrefix(`opportunityCandidates:${params.opportunityId}`);
    return result;
}

export async function updateOpportunityCandidate(params: {
    candidateId: string;
    userId: string | null;
    state?: CandidateStateValue;
    notes?: string | null;
}) {
    const { candidateId, userId, ...data } = params;
    if (Object.keys(data).length === 0) {
        throw new Error("No fields provided to update — at least one optional field must be supplied.");
    }
    const result = await OpportunityCandidateController.updateCandidate(candidateId, userId, data);
    mcpCache.invalidatePrefix(`opportunityCandidates:${result.opportunityId}`);
    return result;
}

export async function deleteOpportunityCandidate(candidateId: string, userId: string | null) {
    const result = await OpportunityCandidateController.deleteCandidate(candidateId, userId);
    mcpCache.invalidatePrefix("opportunityCandidates:");
    return result;
}

export async function promoteOpportunityCandidate(candidateId: string, userId: string | null) {
    const result = await OpportunityCandidateController.promoteCandidate(candidateId, userId);
    mcpCache.invalidatePrefix(`opportunityCandidates:${result.candidate.opportunityId}`);
    mcpCache.invalidatePrefix(`contestSubmissions:${result.submission.projectId}`);
    return result;
}
