import { prisma } from "@/lib/db";
import type { Provider, ContestSubmission, PublicationSubmission } from "@prisma/client";

function serializeProvider(p: Provider) {
    return {
        id: p.id,
        userId: p.userId,
        name: p.name,
        website: p.website,
        notes: p.notes,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
    };
}

function serializeContestSubmission(s: ContestSubmission) {
    return {
        id: s.id,
        projectId: s.projectId,
        providerId: s.providerId,
        contestName: s.contestName,
        submissionDate: s.submissionDate.toISOString(),
        reviewDate: s.reviewDate?.toISOString() ?? null,
        submissionUrl: s.submissionUrl,
        status: s.status,
        notes: s.notes,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
    };
}

function serializePublicationSubmission(s: PublicationSubmission) {
    return {
        id: s.id,
        projectId: s.projectId,
        venueName: s.venueName,
        submissionDate: s.submissionDate.toISOString(),
        status: s.status,
        notes: s.notes,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
    };
}

export class ProviderController {
    static async listProviders(userId: string | null) {
        const where = userId ? { userId } : {};
        const providers = await prisma.provider.findMany({
            where,
            orderBy: { name: "asc" },
        });
        return { providers: providers.map(serializeProvider), total: providers.length };
    }

    static async createProvider(params: {
        userId: string | null;
        name: string;
        website?: string;
        notes?: string;
    }) {
        const provider = await prisma.provider.create({
            data: {
                userId: params.userId ?? "local",
                name: params.name.trim(),
                website: params.website,
                notes: params.notes ?? "",
            },
        });
        return serializeProvider(provider);
    }

    static async updateProvider(
        providerId: string,
        data: { name?: string; website?: string | null; notes?: string }
    ) {
        const existing = await prisma.provider.findUnique({
            where: { id: providerId },
            select: { id: true },
        });
        if (!existing) throw new Error(`Provider not found: ${providerId}`);

        const provider = await prisma.provider.update({
            where: { id: providerId },
            data: {
                name: data.name?.trim(),
                website: data.website,
                notes: data.notes,
            },
        });
        return serializeProvider(provider);
    }

    static async deleteProvider(providerId: string) {
        const existing = await prisma.provider.findUnique({
            where: { id: providerId },
            select: { id: true },
        });
        if (!existing) throw new Error(`Provider not found: ${providerId}`);

        await prisma.provider.delete({ where: { id: providerId } });
        return { success: true, id: providerId };
    }
}

export class PublicationSubmissionController {
    static async listPublicationSubmissions(projectId: string) {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true },
        });
        if (!project) throw new Error(`Project not found: ${projectId}`);

        const submissions = await prisma.publicationSubmission.findMany({
            where: { projectId },
            orderBy: { submissionDate: "desc" },
        });
        return { submissions: submissions.map(serializePublicationSubmission), total: submissions.length };
    }

    static async createPublicationSubmission(params: {
        projectId: string;
        venueName: string;
        submissionDate: string;
        status?: string;
        notes?: string;
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
                notes: params.notes ?? "",
            },
        });
        return serializePublicationSubmission(submission);
    }

    static async updatePublicationSubmission(
        submissionId: string,
        data: { venueName?: string; submissionDate?: string; status?: string; notes?: string }
    ) {
        const existing = await prisma.publicationSubmission.findUnique({
            where: { id: submissionId },
            select: { id: true },
        });
        if (!existing) throw new Error(`Publication submission not found: ${submissionId}`);

        const submission = await prisma.publicationSubmission.update({
            where: { id: submissionId },
            data: {
                venueName: data.venueName?.trim(),
                submissionDate: data.submissionDate ? new Date(data.submissionDate) : undefined,
                status: data.status,
                notes: data.notes,
            },
        });
        return serializePublicationSubmission(submission);
    }

    static async deletePublicationSubmission(submissionId: string) {
        const existing = await prisma.publicationSubmission.findUnique({
            where: { id: submissionId },
            select: { id: true },
        });
        if (!existing) throw new Error(`Publication submission not found: ${submissionId}`);

        await prisma.publicationSubmission.delete({ where: { id: submissionId } });
        return { success: true, id: submissionId };
    }
}

export class ContestSubmissionController {
    static async listContestSubmissions(projectId: string) {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true },
        });
        if (!project) throw new Error(`Project not found: ${projectId}`);

        const submissions = await prisma.contestSubmission.findMany({
            where: { projectId },
            orderBy: { submissionDate: "desc" },
        });
        return { submissions: submissions.map(serializeContestSubmission), total: submissions.length };
    }

    static async createContestSubmission(params: {
        projectId: string;
        providerId: string;
        contestName: string;
        submissionDate: string;
        reviewDate?: string;
        submissionUrl?: string;
        status?: string;
        notes?: string;
    }) {
        const project = await prisma.project.findUnique({
            where: { id: params.projectId },
            select: { id: true, userId: true },
        });
        if (!project) throw new Error(`Project not found: ${params.projectId}`);

        const provider = await prisma.provider.findUnique({
            where: { id: params.providerId },
            select: { id: true, userId: true },
        });
        if (!provider) throw new Error(`Provider not found: ${params.providerId}`);

        // Verify provider belongs to same user as project (when user scoping is active)
        if (project.userId && provider.userId !== project.userId) {
            throw new Error("Provider does not belong to the project owner");
        }

        const submission = await prisma.contestSubmission.create({
            data: {
                projectId: params.projectId,
                providerId: params.providerId,
                contestName: params.contestName.trim(),
                submissionDate: new Date(params.submissionDate),
                reviewDate: params.reviewDate ? new Date(params.reviewDate) : null,
                submissionUrl: params.submissionUrl,
                status: params.status ?? "submitted",
                notes: params.notes ?? "",
            },
        });
        return serializeContestSubmission(submission);
    }

    static async updateContestSubmission(
        submissionId: string,
        data: {
            contestName?: string;
            providerId?: string;
            submissionDate?: string;
            reviewDate?: string | null;
            submissionUrl?: string | null;
            status?: string;
            notes?: string;
        }
    ) {
        const existing = await prisma.contestSubmission.findUnique({
            where: { id: submissionId },
            select: { id: true },
        });
        if (!existing) throw new Error(`Contest submission not found: ${submissionId}`);

        if (data.providerId) {
            const provider = await prisma.provider.findUnique({
                where: { id: data.providerId },
                select: { id: true },
            });
            if (!provider) throw new Error(`Provider not found: ${data.providerId}`);
        }

        const submission = await prisma.contestSubmission.update({
            where: { id: submissionId },
            data: {
                contestName: data.contestName?.trim(),
                providerId: data.providerId,
                submissionDate: data.submissionDate ? new Date(data.submissionDate) : undefined,
                reviewDate: data.reviewDate === null ? null : data.reviewDate ? new Date(data.reviewDate) : undefined,
                submissionUrl: data.submissionUrl,
                status: data.status,
                notes: data.notes,
            },
        });
        return serializeContestSubmission(submission);
    }

    static async deleteContestSubmission(submissionId: string) {
        const existing = await prisma.contestSubmission.findUnique({
            where: { id: submissionId },
            select: { id: true },
        });
        if (!existing) throw new Error(`Contest submission not found: ${submissionId}`);

        await prisma.contestSubmission.delete({ where: { id: submissionId } });
        return { success: true, id: submissionId };
    }
}
