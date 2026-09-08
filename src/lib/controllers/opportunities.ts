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

const withCandidateDetail = {
    provider: { select: { id: true, name: true } },
    candidates: {
        orderBy: { createdAt: "asc" },
        include: {
            project: { select: { id: true, title: true } },
            submission: { select: { id: true, status: true } },
        },
    },
} as const;

type OpportunityWithCandidateDetail = Prisma.OpportunityGetPayload<{ include: typeof withCandidateDetail }>;

function serializeOpportunityWithCandidates(o: OpportunityWithCandidateDetail) {
    const { provider, candidates, ...opportunity } = o;
    return {
        ...serializeOpportunity(opportunity),
        provider,
        candidates: candidates.map((c) => ({
            ...serializeCandidate(c),
            project: c.project,
            submission: c.submission,
        })),
    };
}

const withSubmissionDetail = {
    provider: { select: { id: true, name: true } },
    project: { select: { id: true, title: true } },
} as const;

function serializeUnlinkedSubmission(
    s: Prisma.ContestSubmissionGetPayload<{ include: typeof withSubmissionDetail }>
) {
    return {
        id: s.id,
        projectId: s.projectId,
        providerId: s.providerId,
        contestName: s.contestName,
        submissionDate: s.submissionDate.toISOString(),
        status: s.status,
        provider: s.provider,
        project: s.project,
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

/** The submission a backfill is about: it must be the author's, and still nobody's candidate. */
async function requireOwnedUnlinkedSubmission(submissionId: string, userId: string | null) {
    const submission = await prisma.contestSubmission.findUnique({
        where: { id: submissionId },
        select: {
            id: true,
            projectId: true,
            project: { select: { userId: true } },
            _count: { select: { opportunityCandidates: true } },
        },
    });
    if (!submission) throw new NotFoundError(`Contest submission not found: ${submissionId}`);
    if (submission.project.userId !== userId) throw new ForbiddenError("Forbidden");
    if (submission._count.opportunityCandidates > 0) {
        throw new ConflictError(`Contest submission ${submissionId} already belongs to an opportunity`);
    }
    return submission;
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

export type OpportunityFilters = {
    status?: OpportunityStatusValue;
    providerId?: string;
    projectId?: string;
};

export class OpportunityController {
    static async listOpportunities(userId: string | null, filters: OpportunityFilters = {}) {
        const { status, providerId, projectId } = filters;

        const where: Prisma.OpportunityWhereInput = { userId };
        if (status) where.status = status;
        if (providerId) where.providerId = providerId;
        // An opportunity has no project of its own — it is tied to a project only by a
        // candidate entry, so "opportunities for this project" means the ones it is up for.
        if (projectId) where.candidates = { some: { projectId } };

        const raw = await prisma.opportunity.findMany({
            where,
            include: withCandidateDetail,
            orderBy: { closeDate: "asc" },
        });

        const opportunities = raw.map(serializeOpportunityWithCandidates);
        return { opportunities, total: opportunities.length };
    }

    /**
     * Contest submissions with no opportunity behind them — everything entered before
     * opportunities were tracked, and anything logged straight against a story. They belong
     * in the contests list, but they hold none of an opportunity's fields, so they come back
     * on their own rather than as opportunities with half their data missing.
     */
    static async listSubmissionsWithoutOpportunity(userId: string | null, filters: OpportunityFilters = {}) {
        const { status, providerId, projectId } = filters;
        // These rows have no Opportunity.status, so a filter on one can only rule them out.
        if (status) return { submissions: [], total: 0 };

        const raw = await prisma.contestSubmission.findMany({
            where: {
                opportunityCandidates: { none: {} },
                project: { userId, archivedAt: null },
                ...(providerId ? { providerId } : {}),
                ...(projectId ? { projectId } : {}),
            },
            include: withSubmissionDetail,
            orderBy: { submissionDate: "desc" },
        });

        const submissions = raw.map(serializeUnlinkedSubmission);
        return { submissions, total: submissions.length };
    }

    static async getOpportunity(id: string, userId: string | null) {
        const opportunity = await prisma.opportunity.findUnique({
            where: { id },
            include: withCandidateDetail,
        });
        if (!opportunity) throw new NotFoundError(`Opportunity not found: ${id}`);
        if (opportunity.userId !== userId) throw new ForbiddenError("Forbidden");

        return serializeOpportunityWithCandidates(opportunity);
    }

    static async createOpportunity(
        params: OpportunityWritableFields & {
            userId: string | null;
            providerId: string;
            title: string;
            closeDate: string;
            /** Fills in the missing details of a contest submission that already exists. */
            submissionId?: string;
        }
    ) {
        const { userId, closeDate, reviewDate, title, submissionId, ...rest } = params;
        await requireOwnedProvider(params.providerId, userId);
        const submission = submissionId ? await requireOwnedUnlinkedSubmission(submissionId, userId) : null;

        const data = {
            ...rest,
            userId,
            title: title.trim(),
            closeDate: new Date(closeDate),
            reviewDate: reviewDate ? new Date(reviewDate) : null,
        };

        if (!submission) return serializeOpportunity(await prisma.opportunity.create({ data }));

        // The inverse of promoting a candidate: the entry already happened, so the candidate
        // is born chosen and already carrying its submission — there is no shortlist to record.
        const opportunity = await prisma.$transaction(async (tx) => {
            const created = await tx.opportunity.create({ data });
            await tx.opportunityCandidate.create({
                data: {
                    opportunityId: created.id,
                    projectId: submission.projectId,
                    state: "chosen",
                    submissionId: submission.id,
                },
            });
            return created;
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

/**
 * `opportunityId` is the parent a nested route's URL names. The candidate must really
 * live under it, so a path that pairs a candidate with the wrong opportunity is a 404
 * rather than an operation on a sibling candidate the caller happens to also own.
 */
async function requireOwnedCandidate(candidateId: string, userId: string | null, opportunityId?: string) {
    const candidate = await prisma.opportunityCandidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundError(`Opportunity candidate not found: ${candidateId}`);
    if (opportunityId !== undefined && candidate.opportunityId !== opportunityId) {
        throw new NotFoundError(`Opportunity candidate not found: ${candidateId}`);
    }
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
        data: { state?: CandidateStateValue; notes?: string | null },
        opportunityId?: string
    ) {
        await requireOwnedCandidate(candidateId, userId, opportunityId);

        const candidate = await prisma.opportunityCandidate.update({
            where: { id: candidateId },
            data,
        });

        return serializeCandidate(candidate);
    }

    static async deleteCandidate(candidateId: string, userId: string | null, opportunityId?: string) {
        await requireOwnedCandidate(candidateId, userId, opportunityId);

        await prisma.opportunityCandidate.delete({ where: { id: candidateId } });

        return { success: true, id: candidateId };
    }

    /**
     * Turn a chosen candidate into a real contest submission, carrying over what the
     * opportunity already records instead of re-prompting for it. The candidate row
     * survives promotion — it stays the link between the piece and the opportunity.
     */
    static async promoteCandidate(candidateId: string, userId: string | null, opportunityId?: string) {
        const { candidate, opportunity } = await requireOwnedCandidate(candidateId, userId, opportunityId);

        if (candidate.state !== "chosen") {
            throw new ConflictError(`Only a candidate in state "chosen" can be promoted (this one is "${candidate.state}")`);
        }
        if (candidate.submissionId) {
            throw new ConflictError(`Candidate was already promoted to submission ${candidate.submissionId}`);
        }

        const { promoted, submission } = await prisma.$transaction(async (tx) => {
            const submission = await ContestSubmissionController.createContestSubmission(
                {
                    projectId: candidate.projectId,
                    providerId: opportunity.providerId,
                    contestName: opportunity.title,
                    submissionDate: new Date().toISOString(),
                    reviewDate: opportunity.reviewDate?.toISOString(),
                    submissionUrl: opportunity.rulesUrl ?? undefined,
                },
                tx
            );

            const promoted = await tx.opportunityCandidate.update({
                where: { id: candidateId },
                data: { submissionId: submission.id },
            });

            return { promoted, submission };
        });

        return { candidate: serializeCandidate(promoted), submission };
    }
}
