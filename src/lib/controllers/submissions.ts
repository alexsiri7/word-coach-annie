import { prisma, type DbClient } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { requireOwnedProvider } from "@/lib/controllers/provider-ownership";
import { UserFacingError } from "@/lib/controllers/errors";

// ── Provider ────────────────────────────────────────────────────────────
// Ownership follows the same convention as Opportunity: a null userId is the
// deployment-level caller of a single-user install and is unscoped; a real one
// is matched exactly.

function serializeProvider(p: Prisma.ProviderGetPayload<object>) {
    return {
        id: p.id,
        name: p.name,
        website: p.website,
        notes: p.notes,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
    };
}

export class ProviderController {
    static async listProviders(userId: string | null) {
        const rawProviders = await prisma.provider.findMany({
            where: userId ? { userId } : {},
            orderBy: { name: "asc" },
        });

        const providers = rawProviders.map(serializeProvider);
        return { providers, total: providers.length };
    }

    static async createProvider(params: {
        userId: string | null;
        name: string;
        website?: string;
        notes?: string;
    }) {
        const provider = await prisma.provider.create({
            data: {
                userId: params.userId,
                name: params.name.trim(),
                website: params.website ?? "",
                notes: params.notes ?? "",
            },
        });

        return serializeProvider(provider);
    }

    static async updateProvider(
        id: string,
        userId: string | null,
        data: { name?: string; website?: string; notes?: string }
    ) {
        const existing = await prisma.provider.findUnique({
            where: { id },
            select: { id: true, userId: true },
        });
        if (!existing) throw new UserFacingError(`Provider not found: ${id}`);
        if (userId && existing.userId !== userId) throw new UserFacingError("Forbidden");

        const provider = await prisma.provider.update({
            where: { id },
            data: {
                name: data.name?.trim(),
                website: data.website,
                notes: data.notes,
            },
        });

        return serializeProvider(provider);
    }

    static async deleteProvider(id: string, userId: string | null) {
        const existing = await prisma.provider.findUnique({
            where: { id },
            select: { id: true, userId: true },
        });
        if (!existing) throw new UserFacingError(`Provider not found: ${id}`);
        if (userId && existing.userId !== userId) throw new UserFacingError("Forbidden");

        await prisma.provider.delete({ where: { id } });

        return { success: true, id };
    }
}

// ── ContestSubmission ───────────────────────────────────────────────────

type ContestSubmissionWithProvider = Prisma.ContestSubmissionGetPayload<{
    include: { provider: { select: { id: true; name: true } } };
}>;

function serializeContestSubmission(s: ContestSubmissionWithProvider) {
    return {
        id: s.id,
        projectId: s.projectId,
        providerId: s.providerId,
        contestName: s.contestName,
        submissionDate: s.submissionDate.toISOString(),
        reviewDate: s.reviewDate?.toISOString() ?? null,
        submissionUrl: s.submissionUrl,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        provider: s.provider,
    };
}

export class ContestSubmissionController {
    static async listContestSubmissions(params: { projectId: string }) {
        const project = await prisma.project.findUnique({
            where: { id: params.projectId },
            select: { id: true },
        });
        if (!project) throw new UserFacingError(`Project not found: ${params.projectId}`);

        const rawSubmissions = await prisma.contestSubmission.findMany({
            where: { projectId: params.projectId },
            include: { provider: { select: { id: true, name: true } } },
            orderBy: { submissionDate: "desc" },
        });

        const submissions = rawSubmissions.map(serializeContestSubmission);
        return { submissions, total: submissions.length };
    }

    /** `client` lets a caller enrol this write in its own transaction. */
    static async createContestSubmission(
        params: {
            /** The acting user, who may be an editor rather than the project's owner. */
            userId: string | null;
            projectId: string;
            providerId: string;
            contestName: string;
            submissionDate: string;
            reviewDate?: string;
            submissionUrl?: string;
            status?: string;
        },
        client: DbClient = prisma
    ) {
        const project = await client.project.findUnique({
            where: { id: params.projectId },
            select: { id: true, userId: true },
        });
        if (!project) throw new UserFacingError(`Project not found: ${params.projectId}`);

        await requireOwnedProvider(params.providerId, project.userId, { client, callerId: params.userId });

        const submission = await client.contestSubmission.create({
            data: {
                projectId: params.projectId,
                providerId: params.providerId,
                contestName: params.contestName.trim(),
                submissionDate: new Date(params.submissionDate),
                reviewDate: params.reviewDate ? new Date(params.reviewDate) : null,
                submissionUrl: params.submissionUrl ?? "",
                status: params.status ?? "submitted",
            },
            include: { provider: { select: { id: true, name: true } } },
        });

        return serializeContestSubmission(submission);
    }

    static async updateContestSubmission(
        id: string,
        userId: string | null,
        data: {
            providerId?: string;
            contestName?: string;
            submissionDate?: string;
            reviewDate?: string;
            submissionUrl?: string;
            status?: string;
        }
    ) {
        const existing = await prisma.contestSubmission.findUnique({
            where: { id },
            select: { id: true, project: { select: { userId: true } } },
        });
        if (!existing) throw new UserFacingError(`Contest submission not found: ${id}`);

        if (data.providerId) {
            await requireOwnedProvider(data.providerId, existing.project.userId, { callerId: userId });
        }

        const submission = await prisma.contestSubmission.update({
            where: { id },
            data: {
                providerId: data.providerId,
                contestName: data.contestName?.trim(),
                submissionDate: data.submissionDate ? new Date(data.submissionDate) : undefined,
                reviewDate: data.reviewDate ? new Date(data.reviewDate) : undefined,
                submissionUrl: data.submissionUrl,
                status: data.status,
            },
            include: { provider: { select: { id: true, name: true } } },
        });

        return serializeContestSubmission(submission);
    }

    static async deleteContestSubmission(id: string) {
        const existing = await prisma.contestSubmission.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) throw new UserFacingError(`Contest submission not found: ${id}`);

        await prisma.contestSubmission.delete({ where: { id } });

        return { success: true, id };
    }
}

// ── PublicationSubmission ───────────────────────────────────────────────

function serializePublicationSubmission(s: Prisma.PublicationSubmissionGetPayload<object>) {
    return {
        id: s.id,
        projectId: s.projectId,
        venueName: s.venueName,
        submissionDate: s.submissionDate.toISOString(),
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
    };
}

export class PublicationSubmissionController {
    static async listPublicationSubmissions(params: { projectId: string }) {
        const project = await prisma.project.findUnique({
            where: { id: params.projectId },
            select: { id: true },
        });
        if (!project) throw new UserFacingError(`Project not found: ${params.projectId}`);

        const rawSubmissions = await prisma.publicationSubmission.findMany({
            where: { projectId: params.projectId },
            orderBy: { submissionDate: "desc" },
        });

        const submissions = rawSubmissions.map(serializePublicationSubmission);
        return { submissions, total: submissions.length };
    }

    static async createPublicationSubmission(params: {
        projectId: string;
        venueName: string;
        submissionDate: string;
        status?: string;
    }) {
        const project = await prisma.project.findUnique({
            where: { id: params.projectId },
            select: { id: true },
        });
        if (!project) throw new UserFacingError(`Project not found: ${params.projectId}`);

        const submission = await prisma.publicationSubmission.create({
            data: {
                projectId: params.projectId,
                venueName: params.venueName.trim(),
                submissionDate: new Date(params.submissionDate),
                status: params.status ?? "submitted",
            },
        });

        return serializePublicationSubmission(submission);
    }

    static async updatePublicationSubmission(
        id: string,
        data: {
            venueName?: string;
            submissionDate?: string;
            status?: string;
        }
    ) {
        const existing = await prisma.publicationSubmission.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) throw new UserFacingError(`Publication submission not found: ${id}`);

        const submission = await prisma.publicationSubmission.update({
            where: { id },
            data: {
                venueName: data.venueName?.trim(),
                submissionDate: data.submissionDate ? new Date(data.submissionDate) : undefined,
                status: data.status,
            },
        });

        return serializePublicationSubmission(submission);
    }

    static async deletePublicationSubmission(id: string) {
        const existing = await prisma.publicationSubmission.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) throw new UserFacingError(`Publication submission not found: ${id}`);

        await prisma.publicationSubmission.delete({ where: { id } });

        return { success: true, id };
    }
}
