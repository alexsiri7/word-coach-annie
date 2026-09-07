import { describe, it, expect, beforeEach } from "vitest";
import {
    listOpportunities,
    createOpportunity,
    updateOpportunity,
    deleteOpportunity,
    listOpportunityCandidates,
    createOpportunityCandidate,
    updateOpportunityCandidate,
    deleteOpportunityCandidate,
    promoteOpportunityCandidate,
} from "@/mcp/tools/opportunities";
import { createProvider } from "@/mcp/tools/submissions";
import { ProjectsController } from "@/lib/controllers/projects";
import { prisma } from "@/lib/db";

const CLOSE_DATE = "2030-04-01T00:00:00.000Z";
const REVIEW_DATE = "2030-06-01T00:00:00.000Z";

describe("MCP Opportunity Tools", () => {
    let projectId: string;
    let userId: string;
    let providerId: string;

    beforeEach(async () => {
        const user = await prisma.user.create({
            data: { id: "opp-user-1", email: "opp-user-1@test.com", googleId: "google-opp-user-1", name: "Test User" },
        });
        userId = user.id;
        const project = await ProjectsController.createProject({ title: "Test Project", userId });
        projectId = project.id;
        const provider = await createProvider({ userId, name: "Contest Org" });
        providerId = provider.id;
    });

    async function makeOpportunity(overrides: Record<string, unknown> = {}) {
        return createOpportunity({
            userId,
            providerId,
            title: "Spring Prize",
            closeDate: CLOSE_DATE,
            ...overrides,
        });
    }

    describe("Opportunity tools", () => {
        it("creates and lists opportunities scoped to the current user, soonest deadline first", async () => {
            await makeOpportunity({ title: "Later", closeDate: "2030-09-01T00:00:00.000Z" });
            await makeOpportunity({ title: "Sooner" });

            const { opportunities, total } = await listOpportunities(userId);
            expect(total).toBe(2);
            expect(opportunities.map((o) => o.title)).toEqual(["Sooner", "Later"]);
        });

        it("stores every optional field the issue documents", async () => {
            const created = await makeOpportunity({
                reviewDate: REVIEW_DATE,
                rulesUrl: "https://example.com/rules",
                entryFee: "free for subscribers",
                wordLimit: 5000,
                lineLimit: 40,
                genreRestrictions: "speculative fiction only",
                eligibilityNotes: "UK residents, unrepresented authors",
                status: "considering",
            });

            expect(created).toMatchObject({
                closeDate: CLOSE_DATE,
                reviewDate: REVIEW_DATE,
                rulesUrl: "https://example.com/rules",
                entryFee: "free for subscribers",
                wordLimit: 5000,
                lineLimit: 40,
                genreRestrictions: "speculative fiction only",
                eligibilityNotes: "UK residents, unrepresented authors",
                status: "considering",
            });
        });

        it("defaults status to found and leaves unknown fields null", async () => {
            const created = await makeOpportunity();
            expect(created.status).toBe("found");
            expect(created.reviewDate).toBeNull();
            expect(created.entryFee).toBeNull();
            expect(created.wordLimit).toBeNull();
        });

        it("does not list another user's opportunities", async () => {
            await makeOpportunity();
            const { total } = await listOpportunities("someone-else");
            expect(total).toBe(0);
        });

        it("rejects creating an opportunity against another user's provider", async () => {
            const other = await prisma.user.create({
                data: { id: "opp-user-2", email: "opp-user-2@test.com", googleId: "google-opp-user-2" },
            });
            const otherProvider = await createProvider({ userId: other.id, name: "Their Org" });

            await expect(
                createOpportunity({ userId, providerId: otherProvider.id, title: "Hijack", closeDate: CLOSE_DATE })
            ).rejects.toThrow("Forbidden");
        });

        it("supports the single-user (no auth) path — null userId is passed through, not substituted", async () => {
            const provider = await createProvider({ userId: null, name: "No Auth Org" });
            const created = await createOpportunity({
                userId: null,
                providerId: provider.id,
                title: "No Auth Prize",
                closeDate: CLOSE_DATE,
            });

            const stored = await prisma.opportunity.findUnique({ where: { id: created.id } });
            expect(stored?.userId).toBeNull();

            const { total } = await listOpportunities(null);
            expect(total).toBe(1);

            expect(await deleteOpportunity(created.id, null)).toMatchObject({ success: true });
        });

        it("updates specified fields and clears nullable ones when passed null", async () => {
            const created = await makeOpportunity({ entryFee: "£10", reviewDate: REVIEW_DATE });

            const updated = await updateOpportunity({
                opportunityId: created.id,
                userId,
                status: "closed",
                entryFee: null,
                reviewDate: null,
            });

            expect(updated.status).toBe("closed");
            expect(updated.entryFee).toBeNull();
            expect(updated.reviewDate).toBeNull();
            expect(updated.title).toBe("Spring Prize");
        });

        it("throws when no optional fields are provided to updateOpportunity", async () => {
            const created = await makeOpportunity();
            await expect(updateOpportunity({ opportunityId: created.id, userId }))
                .rejects.toThrow("No fields provided to update");
        });

        it("rejects updating an opportunity owned by a different user", async () => {
            const created = await makeOpportunity();
            await expect(updateOpportunity({ opportunityId: created.id, userId: "someone-else", title: "Hijacked" }))
                .rejects.toThrow("Forbidden");
        });

        it("rejects deleting an opportunity owned by a different user", async () => {
            const created = await makeOpportunity();
            await expect(deleteOpportunity(created.id, "someone-else")).rejects.toThrow("Forbidden");
        });

        it("deletes the opportunity's candidates along with it", async () => {
            const opportunity = await makeOpportunity();
            const candidate = await createOpportunityCandidate({ opportunityId: opportunity.id, userId, projectId });

            await deleteOpportunity(opportunity.id, userId);

            expect(await prisma.opportunityCandidate.findUnique({ where: { id: candidate.id } })).toBeNull();
        });
    });

    describe("Opportunity candidate tools", () => {
        let opportunityId: string;

        beforeEach(async () => {
            const opportunity = await makeOpportunity();
            opportunityId = opportunity.id;
        });

        it("puts a project forward and lists it", async () => {
            const created = await createOpportunityCandidate({
                opportunityId,
                userId,
                projectId,
                notes: "Right length, right genre",
            });

            expect(created).toMatchObject({ projectId, state: "candidate", submissionId: null });

            const { candidates, total } = await listOpportunityCandidates(opportunityId, userId);
            expect(total).toBe(1);
            expect(candidates[0].notes).toBe("Right length, right genre");
        });

        it("rejects attaching a project owned by a different user", async () => {
            const other = await prisma.user.create({
                data: { id: "opp-user-3", email: "opp-user-3@test.com", googleId: "google-opp-user-3" },
            });
            const otherProject = await ProjectsController.createProject({ title: "Their Novel", userId: other.id });

            await expect(
                createOpportunityCandidate({ opportunityId, userId, projectId: otherProject.id })
            ).rejects.toThrow("Forbidden");
        });

        it("rejects listing candidates of another user's opportunity", async () => {
            await expect(listOpportunityCandidates(opportunityId, "someone-else")).rejects.toThrow("Forbidden");
        });

        it("allows the same project to be a candidate only once per opportunity", async () => {
            await createOpportunityCandidate({ opportunityId, userId, projectId });
            await expect(createOpportunityCandidate({ opportunityId, userId, projectId })).rejects.toThrow();
        });

        it("allows several chosen candidates for one opportunity", async () => {
            const second = await ProjectsController.createProject({ title: "Second Story", userId });
            const a = await createOpportunityCandidate({ opportunityId, userId, projectId, state: "chosen" });
            const b = await createOpportunityCandidate({
                opportunityId,
                userId,
                projectId: second.id,
                state: "chosen",
            });

            expect([a.state, b.state]).toEqual(["chosen", "chosen"]);
        });

        it("updates state and notes", async () => {
            const created = await createOpportunityCandidate({ opportunityId, userId, projectId });
            const updated = await updateOpportunityCandidate({
                candidateId: created.id,
                userId,
                state: "dropped",
                notes: "Over the word limit",
            });

            expect(updated).toMatchObject({ state: "dropped", notes: "Over the word limit" });
        });

        it("rejects updating a candidate under another user's opportunity", async () => {
            const created = await createOpportunityCandidate({ opportunityId, userId, projectId });
            await expect(updateOpportunityCandidate({ candidateId: created.id, userId: "someone-else", state: "chosen" }))
                .rejects.toThrow("Forbidden");
        });

        it("deletes a candidate without touching the opportunity or the project", async () => {
            const created = await createOpportunityCandidate({ opportunityId, userId, projectId });

            expect(await deleteOpportunityCandidate(created.id, userId)).toMatchObject({ success: true });
            expect(await prisma.opportunity.findUnique({ where: { id: opportunityId } })).not.toBeNull();
            expect(await prisma.project.findUnique({ where: { id: projectId } })).not.toBeNull();
        });

        it("deletes candidate rows with the project, but never the opportunity", async () => {
            const created = await createOpportunityCandidate({ opportunityId, userId, projectId });

            await prisma.project.delete({ where: { id: projectId } });

            expect(await prisma.opportunityCandidate.findUnique({ where: { id: created.id } })).toBeNull();
            expect(await prisma.opportunity.findUnique({ where: { id: opportunityId } })).not.toBeNull();
        });
    });

    describe("Promotion to a contest submission", () => {
        let opportunityId: string;

        beforeEach(async () => {
            const opportunity = await makeOpportunity({
                reviewDate: REVIEW_DATE,
                rulesUrl: "https://example.com/rules",
            });
            opportunityId = opportunity.id;
        });

        it("creates a contest submission carrying over what the opportunity already knows", async () => {
            const candidate = await createOpportunityCandidate({
                opportunityId,
                userId,
                projectId,
                state: "chosen",
            });

            const { submission, candidate: promoted } = await promoteOpportunityCandidate(candidate.id, userId);

            expect(submission).toMatchObject({
                projectId,
                providerId,
                contestName: "Spring Prize",
                reviewDate: REVIEW_DATE,
                submissionUrl: "https://example.com/rules",
                status: "submitted",
            });
            expect(promoted.submissionId).toBe(submission.id);
        });

        it("keeps the candidate record as the link between the piece and the opportunity", async () => {
            const candidate = await createOpportunityCandidate({
                opportunityId,
                userId,
                projectId,
                state: "chosen",
            });

            await promoteOpportunityCandidate(candidate.id, userId);

            const stored = await prisma.opportunityCandidate.findUnique({ where: { id: candidate.id } });
            expect(stored).not.toBeNull();
            expect(stored?.opportunityId).toBe(opportunityId);
        });

        it("refuses to promote a candidate that has not been chosen", async () => {
            const candidate = await createOpportunityCandidate({ opportunityId, userId, projectId });
            await expect(promoteOpportunityCandidate(candidate.id, userId))
                .rejects.toThrow('Only a candidate in state "chosen" can be promoted');
        });

        it("refuses to promote the same candidate twice", async () => {
            const candidate = await createOpportunityCandidate({
                opportunityId,
                userId,
                projectId,
                state: "chosen",
            });
            await promoteOpportunityCandidate(candidate.id, userId);

            await expect(promoteOpportunityCandidate(candidate.id, userId))
                .rejects.toThrow("already promoted");
            expect(await prisma.contestSubmission.count({ where: { projectId } })).toBe(1);
        });

        it("refuses to promote a candidate under another user's opportunity", async () => {
            const candidate = await createOpportunityCandidate({
                opportunityId,
                userId,
                projectId,
                state: "chosen",
            });
            await expect(promoteOpportunityCandidate(candidate.id, "someone-else")).rejects.toThrow("Forbidden");
        });

        it("clears the link when the promoted submission is deleted, leaving the candidate in place", async () => {
            const candidate = await createOpportunityCandidate({
                opportunityId,
                userId,
                projectId,
                state: "chosen",
            });
            const { submission } = await promoteOpportunityCandidate(candidate.id, userId);

            await prisma.contestSubmission.delete({ where: { id: submission.id } });

            const stored = await prisma.opportunityCandidate.findUnique({ where: { id: candidate.id } });
            expect(stored?.submissionId).toBeNull();
        });
    });
});
