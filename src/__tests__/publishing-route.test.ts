import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
    getCurrentUserId: vi.fn(() => null as string | null),
}));

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { ProjectsController } from "@/lib/controllers/projects";
import { OpportunityCandidateController, OpportunityController } from "@/lib/controllers/opportunities";
import { ContestSubmissionController, PublicationSubmissionController } from "@/lib/controllers/submissions";
import { deriveStoryState, type Story } from "@/lib/story-placement";

const CLOSE_DATE = "2030-04-01T00:00:00.000Z";
const SENT_DATE = "2026-05-01T00:00:00.000Z";

function request(): NextRequest {
    return new NextRequest("http://localhost/api/publishing");
}

async function get() {
    const { GET } = await import("@/app/api/publishing/route");
    return GET(request());
}

describe("GET /api/publishing", () => {
    let userId: string;
    let providerId: string;
    let projectId: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        const user = await prisma.user.create({
            data: { id: "publishing-user", email: "publishing@test.com", googleId: "google-publishing" },
        });
        userId = user.id;
        providerId = (await prisma.provider.create({ data: { userId, name: "Harbour Review" } })).id;
        projectId = (await ProjectsController.createProject({ title: "The Amber Throne", userId })).id;
        vi.mocked(getCurrentUserId).mockReturnValue(userId);
    });

    it("rejects a caller without a user", async () => {
        vi.mocked(getCurrentUserId).mockReturnValue(null);
        expect((await get()).status).toBe(401);
    });

    it("returns every story with the records that say where it sits", async () => {
        const opportunity = await OpportunityController.createOpportunity({
            userId,
            providerId,
            title: "Coastal Fiction Prize",
            closeDate: CLOSE_DATE,
        });
        await OpportunityCandidateController.createCandidate({
            opportunityId: opportunity.id,
            userId,
            projectId,
            state: "candidate",
        });
        await PublicationSubmissionController.createPublicationSubmission({
            projectId,
            venueName: "The Quarterly",
            submissionDate: SENT_DATE,
            status: "rejected",
        });

        const body = await (await get()).json();

        expect(body.stories).toHaveLength(1);
        expect(body.stories[0]).toMatchObject({
            id: projectId,
            title: "The Amber Throne",
            candidates: [
                {
                    state: "candidate",
                    opportunity: { title: "Coastal Fiction Prize", provider: { id: providerId, name: "Harbour Review" } },
                    submission: null,
                },
            ],
            contestSubmissions: [],
            publicationSubmissions: [{ venueName: "The Quarterly", status: "rejected" }],
        });
        expect(body.opportunities).toHaveLength(1);
    });

    it("carries a promoted candidate as one placement, not two", async () => {
        const opportunity = await OpportunityController.createOpportunity({
            userId,
            providerId,
            title: "Coastal Fiction Prize",
            closeDate: CLOSE_DATE,
        });
        const candidate = await OpportunityCandidateController.createCandidate({
            opportunityId: opportunity.id,
            userId,
            projectId,
            state: "chosen",
        });
        await OpportunityCandidateController.promoteCandidate(candidate.id, userId);

        const body = await (await get()).json();
        const story: Story = body.stories[0];

        expect(story.contestSubmissions).toHaveLength(1);
        expect(story.candidates[0].submission).toMatchObject({ status: "submitted" });
        expect(deriveStoryState(story, new Date()).placements).toEqual([
            expect.objectContaining({ label: "Out with Coastal Fiction Prize" }),
        ]);
    });

    it("leaves out another author's stories and archived ones", async () => {
        const other = await prisma.user.create({
            data: { id: "other-user", email: "other@test.com", googleId: "google-other" },
        });
        await ProjectsController.createProject({ title: "Not Mine", userId: other.id });
        const archived = await ProjectsController.createProject({ title: "Put Away", userId });
        await prisma.project.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });

        const body = await (await get()).json();

        expect(body.stories.map((s: Story) => s.title)).toEqual(["The Amber Throne"]);
    });

    it("orders contest submissions with the most recent first", async () => {
        await ContestSubmissionController.createContestSubmission({
            projectId,
            providerId,
            contestName: "Older Prize",
            submissionDate: "2026-01-01T00:00:00.000Z",
        });
        await ContestSubmissionController.createContestSubmission({
            projectId,
            providerId,
            contestName: "Newer Prize",
            submissionDate: SENT_DATE,
        });

        const body = await (await get()).json();

        expect(body.stories[0].contestSubmissions.map((s: { contestName: string }) => s.contestName)).toEqual([
            "Newer Prize",
            "Older Prize",
        ]);
    });
});
