import {
    OpportunityController,
    OpportunityCandidateController,
    type OpportunityFilters,
} from "@/lib/controllers/opportunities";
import type { CandidateStateValue, OpportunityStatusValue } from "@/schemas/opportunities";
import { mcpCache } from "@/lib/cache";

// ── Opportunities (user-scoped) ─────────────────────────────────────────
// Like providers, opportunities belong to the current user rather than to a
// project, so a null userId (single-user mode) is passed straight through.

/**
 * Candidate entries feed both cached reads — `get_opportunity` embeds them and the
 * project filter selects on them — so candidate writes invalidate this too.
 */
function invalidateOpportunities(userId: string | null) {
    mcpCache.invalidatePrefix(`opportunities:${userId}`);
    mcpCache.invalidatePrefix(`opportunity:${userId}`);
}

export async function listOpportunities(userId: string | null, filters: OpportunityFilters = {}) {
    const key = `opportunities:${userId}:${filters.status ?? ""}:${filters.providerId ?? ""}:${filters.projectId ?? ""}`;
    return mcpCache.getOrSet(key, () => OpportunityController.listOpportunities(userId, filters));
}

export async function getOpportunity(opportunityId: string, userId: string | null) {
    const key = `opportunity:${userId}:${opportunityId}`;
    return mcpCache.getOrSet(key, () => OpportunityController.getOpportunity(opportunityId, userId));
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
    invalidateOpportunities(params.userId);
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
    invalidateOpportunities(userId);
    return result;
}

export async function deleteOpportunity(opportunityId: string, userId: string | null) {
    const result = await OpportunityController.deleteOpportunity(opportunityId, userId);
    invalidateOpportunities(userId);
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
    invalidateOpportunities(params.userId);
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
    invalidateOpportunities(userId);
    return result;
}

export async function deleteOpportunityCandidate(candidateId: string, userId: string | null) {
    const result = await OpportunityCandidateController.deleteCandidate(candidateId, userId);
    mcpCache.invalidatePrefix("opportunityCandidates:");
    invalidateOpportunities(userId);
    return result;
}

export async function promoteOpportunityCandidate(candidateId: string, userId: string | null) {
    const result = await OpportunityCandidateController.promoteCandidate(candidateId, userId);
    mcpCache.invalidatePrefix(`opportunityCandidates:${result.candidate.opportunityId}`);
    mcpCache.invalidatePrefix(`contestSubmissions:${result.submission.projectId}`);
    invalidateOpportunities(userId);
    return result;
}
