import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const withPlacements = {
    opportunityCandidates: {
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            state: true,
            opportunity: {
                select: { id: true, title: true, provider: { select: { id: true, name: true } } },
            },
            submission: { select: { id: true, status: true, submissionDate: true } },
        },
    },
    contestSubmissions: {
        orderBy: { submissionDate: "desc" },
        select: {
            id: true,
            contestName: true,
            status: true,
            submissionDate: true,
            provider: { select: { id: true, name: true } },
        },
    },
    publicationSubmissions: {
        orderBy: { submissionDate: "desc" },
        select: { id: true, venueName: true, status: true, submissionDate: true },
    },
} as const;

type ProjectWithPlacements = Prisma.ProjectGetPayload<{
    select: { id: true; title: true } & typeof withPlacements;
}>;

function serializeStory(project: ProjectWithPlacements) {
    return {
        id: project.id,
        title: project.title,
        candidates: project.opportunityCandidates.map((c) => ({
            id: c.id,
            state: c.state,
            opportunity: c.opportunity,
            submission: c.submission && {
                id: c.submission.id,
                status: c.submission.status,
                submissionDate: c.submission.submissionDate.toISOString(),
            },
        })),
        contestSubmissions: project.contestSubmissions.map((s) => ({
            id: s.id,
            contestName: s.contestName,
            status: s.status,
            submissionDate: s.submissionDate.toISOString(),
            provider: s.provider,
        })),
        publicationSubmissions: project.publicationSubmissions.map((s) => ({
            id: s.id,
            venueName: s.venueName,
            status: s.status,
            submissionDate: s.submissionDate.toISOString(),
        })),
    };
}

export class PublishingController {
    /**
     * Every story the author is still working on, with all three records that say where it
     * currently sits. Archived projects are left out for the same reason the dashboard's
     * project list leaves them out — they have been put away deliberately.
     */
    static async listStories(userId: string | null) {
        const projects = await prisma.project.findMany({
            where: { userId, archivedAt: null },
            orderBy: { title: "asc" },
            select: { id: true, title: true, ...withPlacements },
        });

        const stories = projects.map(serializeStory);
        return { stories, total: stories.length };
    }
}
