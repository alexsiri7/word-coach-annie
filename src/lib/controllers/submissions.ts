import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// ── Provider ────────────────────────────────────────────────────────────

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
    static async listProviders(userId: string) {
        const providers = (
            await prisma.provider.findMany({
                where: { userId },
                orderBy: { name: "asc" },
            })
        ).map(serializeProvider);
        return { providers, total: providers.length };
    }

    static async createProvider(params: {
        userId: string;
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
        userId: string,
        data: { name?: string; website?: string; notes?: string }
    ) {
        const existing = await prisma.provider.findUnique({
            where: { id },
            select: { id: true, userId: true },
        });
        if (!existing) throw new Error(`Provider not found: ${id}`);
        if (existing.userId !== userId) throw new Error("Forbidden");

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

    static async deleteProvider(id: string, userId: string) {
        const existing = await prisma.provider.findUnique({
            where: { id },
            select: { id: true, userId: true },
        });
        if (!existing) throw new Error(`Provider not found: ${id}`);
        if (existing.userId !== userId) throw new Error("Forbidden");

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
        if (!project) throw new Error(`Project not found: ${params.projectId}`);

        const submissions = (
            await prisma.contestSubmission.findMany({
                where: { projectId: params.projectId },
                include: { provider: { select: { id: true, name: true } } },
                orderBy: { submissionDate: "desc" },
            })
        ).map(serializeContestSubmission);
        return { submissions, total: submissions.length };
    }

    static async createContestSubmission(params: {
        projectId: string;
        providerId: string;
        contestName: string;
        submissionDate: string;
        reviewDate?: string;
        submissionUrl?: string;
        status?: string;
    }) {
        const project = await prisma.project.findUnique({
            where: { id: params.projectId },
            select: { id: true },
        });
        if (!project) throw new Error(`Project not found: ${params.projectId}`);

        const provider = await prisma.provider.findUnique({
            where: { id: params.providerId },
            select: { id: true },
        });
        if (!provider) throw new Error(`Provider not found: ${params.providerId}`);

        const submission = await prisma.contestSubmission.create({
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
            select: { id: true },
        });
        if (!existing) throw new Error(`Contest submission not found: ${id}`);

        if (data.providerId) {
            const provider = await prisma.provider.findUnique({
                where: { id: data.providerId },
                select: { id: true },
            });
            if (!provider) throw new Error(`Provider not found: ${data.providerId}`);
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
        if (!existing) throw new Error(`Contest submission not found: ${id}`);

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
        if (!project) throw new Error(`Project not found: ${params.projectId}`);

        const submissions = (
            await prisma.publicationSubmission.findMany({
                where: { projectId: params.projectId },
                orderBy: { submissionDate: "desc" },
            })
        ).map(serializePublicationSubmission);
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
        if (!project) throw new Error(`Project not found: ${params.projectId}`);

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
        if (!existing) throw new Error(`Publication submission not found: ${id}`);

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
        if (!existing) throw new Error(`Publication submission not found: ${id}`);

        await prisma.publicationSubmission.delete({ where: { id } });

        return { success: true, id };
    }
}
