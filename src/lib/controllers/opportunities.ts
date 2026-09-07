import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { ContestSubmissionController } from "@/lib/controllers/submissions";
import type { CandidateStateValue, OpportunityStatusValue } from "@/schemas/opportunities";

export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}
/** The row exists and is owned, but its current state forbids the operation. */
export class ConflictError extends Error {}

// ── Opportunity ─────────────────────────────────────────────────────────

function serializeOpportunity(o: Prisma.OpportunityGetPayload<object>) {
    return {
        id: o.id,
        providerId: o.providerId,
        title: o.title,
        closeDate: o.closeDate.toISOString(),
        reviewDate: o.reviewDate?.toISOString() ?? null,
        rulesUrl: o.rulesUrl,
        entryFee: o.entryFee,
        wordLimit: o.wordLimit,
        lineLimit: o.lineLimit,
        genreRestrictions: o.genreRestrictions,
        eligibilityNotes: o.eligibilityNotes,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
    };
}

async function requireOwnedOpportunity(id: string, userId: string | null) {
    const existing = await prisma.opportunity.findUnique({
        where: { id },
        select: { id: true, userId: true, providerId: true, title: true, reviewDate: true, rulesUrl: true },
    });
    if (!existing) throw new NotFoundError(`Opportunity not found: ${id}`);
    if (existing.userId !== userId) throw new ForbiddenError("Forbidden");
    return existing;
}

async function requireOwnedProvider(providerId: string, userId: string | null) {
    const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: { id: true, userId: true },
    });
    if (!provider) throw new NotFoundError(`Provider not found: ${providerId}`);
    if (provider.userId !== userId) throw new ForbiddenError("Forbidden");
}

async function requireOwnedProject(projectId: string, userId: string | null) {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, userId: true },
    });
    if (!project) throw new NotFoundError(`Project not found: ${projectId}`);
    if (project.userId !== userId) throw new ForbiddenError("Forbidden");
}

type OpportunityWritableFields = {
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
};

export class OpportunityController {
    static async listOpportunities(userId: string | null) {
        const raw = await prisma.opportunity.findMany({
            where: { userId },
            orderBy: { closeDate: "asc" },
        });

        const opportunities = raw.map(serializeOpportunity);
        return { opportunities, total: opportunities.length };
    }

    static async createOpportunity(
        params: OpportunityWritableFields & {
            userId: string | null;
            providerId: string;
            title: string;
            closeDate: string;
        }
    ) {
        const { userId, closeDate, reviewDate, title, ...rest } = params;
        await requireOwnedProvider(params.providerId, userId);

        const opportunity = await prisma.opportunity.create({
            data: {
                ...rest,
                userId,
                title: title.trim(),
                closeDate: new Date(closeDate),
                reviewDate: reviewDate ? new Date(reviewDate) : null,
            },
        });

        return serializeOpportunity(opportunity);
    }

    static async updateOpportunity(id: string, userId: string | null, data: OpportunityWritableFields) {
        await requireOwnedOpportunity(id, userId);
        if (data.providerId) await requireOwnedProvider(data.providerId, userId);

        const { closeDate, reviewDate, title, ...rest } = data;
        const opportunity = await prisma.opportunity.update({
            where: { id },
            data: {
                ...rest,
                title: title?.trim(),
                closeDate: closeDate ? new Date(closeDate) : undefined,
                reviewDate: reviewDate === undefined ? undefined : reviewDate === null ? null : new Date(reviewDate),
            },
        });

        return serializeOpportunity(opportunity);
    }

    static async deleteOpportunity(id: string, userId: string | null) {
        await requireOwnedOpportunity(id, userId);

        await prisma.opportunity.delete({ where: { id } });

        return { success: true, id };
    }
}

// ── OpportunityCandidate ────────────────────────────────────────────────

function serializeCandidate(c: Prisma.OpportunityCandidateGetPayload<object>) {
    return {
        id: c.id,
        opportunityId: c.opportunityId,
        projectId: c.projectId,
        state: c.state,
        notes: c.notes,
        submissionId: c.submissionId,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
    };
}

async function requireOwnedCandidate(candidateId: string, userId: string | null) {
    const candidate = await prisma.opportunityCandidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundError(`Opportunity candidate not found: ${candidateId}`);
    const opportunity = await requireOwnedOpportunity(candidate.opportunityId, userId);
    return { candidate, opportunity };
}

export class OpportunityCandidateController {
    static async listCandidates(opportunityId: string, userId: string | null) {
        await requireOwnedOpportunity(opportunityId, userId);

        const raw = await prisma.opportunityCandidate.findMany({
            where: { opportunityId },
            orderBy: { createdAt: "asc" },
        });

        const candidates = raw.map(serializeCandidate);
        return { candidates, total: candidates.length };
    }

    static async createCandidate(params: {
        opportunityId: string;
        userId: string | null;
        projectId: string;
        state?: CandidateStateValue;
        notes?: string | null;
    }) {
        await requireOwnedOpportunity(params.opportunityId, params.userId);
        await requireOwnedProject(params.projectId, params.userId);

        const candidate = await prisma.opportunityCandidate.create({
            data: {
                opportunityId: params.opportunityId,
                projectId: params.projectId,
                state: params.state,
                notes: params.notes ?? null,
            },
        });

        return serializeCandidate(candidate);
    }

    static async updateCandidate(
        candidateId: string,
        userId: string | null,
        data: { state?: CandidateStateValue; notes?: string | null }
    ) {
        await requireOwnedCandidate(candidateId, userId);

        const candidate = await prisma.opportunityCandidate.update({
            where: { id: candidateId },
            data,
        });

        return serializeCandidate(candidate);
    }

    static async deleteCandidate(candidateId: string, userId: string | null) {
        await requireOwnedCandidate(candidateId, userId);

        await prisma.opportunityCandidate.delete({ where: { id: candidateId } });

        return { success: true, id: candidateId };
    }

    /**
     * Turn a chosen candidate into a real contest submission, carrying over what the
     * opportunity already records instead of re-prompting for it. The candidate row
     * survives promotion — it stays the link between the piece and the opportunity.
     */
    static async promoteCandidate(candidateId: string, userId: string | null) {
        const { candidate, opportunity } = await requireOwnedCandidate(candidateId, userId);

        if (candidate.state !== "chosen") {
            throw new ConflictError(`Only a candidate in state "chosen" can be promoted (this one is "${candidate.state}")`);
        }
        if (candidate.submissionId) {
            throw new ConflictError(`Candidate was already promoted to submission ${candidate.submissionId}`);
        }

        const submission = await ContestSubmissionController.createContestSubmission({
            projectId: candidate.projectId,
            providerId: opportunity.providerId,
            contestName: opportunity.title,
            submissionDate: new Date().toISOString(),
            reviewDate: opportunity.reviewDate?.toISOString(),
            submissionUrl: opportunity.rulesUrl ?? undefined,
        });

        const promoted = await prisma.opportunityCandidate.update({
            where: { id: candidateId },
            data: { submissionId: submission.id },
        });

        return { candidate: serializeCandidate(promoted), submission };
    }
}
